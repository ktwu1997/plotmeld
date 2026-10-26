"use client";

import { useRef, useState, type FormEvent } from "react";
import type { BookCandidate, ComparablesBriefInput, ComparablesBriefReport, QlooEvidence, RunComparablesBrief } from "../lib/contracts";
import { runComparablesBrief as apiRunComparablesBrief } from "../lib/features/client";
import { Trace } from "./trace";

const returned = (value: unknown) => value === undefined ? "Not returned" : String(value);
function factsText(candidate: BookCandidate) {
  const f = candidate.facts;
  return `Author: ${returned(f.author)}\nYear: ${returned(f.year)}\nPublisher: ${returned(f.publisher)}\nISBN-13: ${returned(f.isbn13)}\nGoodreads: ${f.goodreads ? `${f.goodreads.rating} (${f.goodreads.count} ratings)` : "Not returned"}`;
}
export function plainTextBrief(report: Extract<ComparablesBriefReport, { status: "ok" }>) {
  return [`Paper Neighbors`, `References: ${report.input.references.join("; ")}`, `Genre: ${report.genre.name}`, ...(report.input.manuscriptNote ? [`Manuscript note (local-only): ${report.input.manuscriptNote}`] : []), "Audience overlap only; not content similarity or sales comps.", ...report.candidates.slice(0, 3).map(c => `${c.book.name}\n${factsText(c)}\nAudience overlap (Qloo affinity): ${returned(c.book.affinity)}\nAI interpretation: ${c.whyRead}\nYou still cannot claim:\n${c.cannotClaim.join("\n")}`), `Author to verify:\n${report.unknowns.join("\n")}`].join("\n\n");
}
function BookCard({ candidate: c, references }: { candidate: BookCandidate; references: QlooEvidence[] }) {
  const [failed, setFailed] = useState(false);
  return <article className="book-card" aria-label={c.book.name}>
    {/* eslint-disable-next-line @next/next/no-img-element -- Remote Qloo covers use plain img to avoid image optimisation on the free tier. */}
    <div className="cover">{c.book.imageUrl && !failed ? <img src={c.book.imageUrl} alt={`Cover of ${c.book.name}`} onError={() => setFailed(true)} loading="lazy" referrerPolicy="no-referrer" /> : <div role="img" aria-label={`${c.book.name}: cover unavailable`}>Cover unavailable</div>}</div>
    <div className="book-body"><h3>{c.book.name}</h3><dl className="facts">{factsText(c).split("\n").map(line => { const index = line.indexOf(":"); return <div key={line}><dt>{line.slice(0, index)}</dt><dd>{line.slice(index + 2)}</dd></div>; })}</dl>
      <p>Audience overlap (Qloo affinity): <strong>{returned(c.book.affinity)}</strong></p><p className="muted">Audience co-affinity, not content similarity.</p>
      <h4>Per-reference contribution</h4>{c.contributions.length ? c.contributions.map(item => <label className="contribution" key={item.refEntityId}>{references.find(ref => ref.entityId === item.refEntityId)?.name ?? item.refEntityId}: {item.score}<meter min={0} max={1} value={item.score} /></label>) : <p>Not returned</p>}
      <h4>AI interpretation</h4><p>{c.whyRead}</p><h4>You still cannot claim</h4><ul>{c.cannotClaim.map(item => <li key={item}>{item}</li>)}</ul>
      <details><summary>Inspect receipts</summary><ul className="evidence-list">{c.evidence.map((item, index) => <li key={`${item.entityId}-${index}`}><strong>{item.name}</strong><dl><dt>Entity ID</dt><dd>{item.entityId}</dd><dt>Type</dt><dd>{item.type}</dd><dt>Affinity</dt><dd>{returned(item.affinity)}</dd><dt>Source call</dt><dd>{item.sourceCall}</dd></dl></li>)}</ul></details>
    </div>
  </article>;
}
export function ComparablesBrief({ runComparablesBrief = apiRunComparablesBrief, demo = false }: { runComparablesBrief?: RunComparablesBrief; demo?: boolean }) {
  const [first, setFirst] = useState("Prisoners"), [second, setSecond] = useState("Normal People");
  const [genreQuery, setGenreQuery] = useState("psychological thriller"), [manuscriptNote, setNote] = useState("");
  const [report, setReport] = useState<(ComparablesBriefReport & { cachedRunAt?: string }) | null>(null), [running, setRunning] = useState(false), [error, setError] = useState(""), [copyStatus, setCopyStatus] = useState("");
  const busy = useRef(false);
  async function run(input: ComparablesBriefInput, live = false) {
    if (busy.current) return;
    busy.current = true; setRunning(true); setError(""); setReport(null); setCopyStatus("");
    try {
      const { manuscriptNote: localNote, ...payload } = input;
      const result = await (live ? runComparablesBrief(payload, { live: true }) : runComparablesBrief(payload));
      setReport({ ...result, input: { ...result.input, ...(localNote ? { manuscriptNote: localNote } : {}) } });
    } catch (error) { setError(error instanceof Error && error.message.startsWith("Demo LLM budget reached") ? error.message : "Research interrupted. Check your connection and submit again."); }
    finally { busy.current = false; setRunning(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void run({ references: [first.trim(), second.trim()], ...(genreQuery.trim() ? { genreQuery: genreQuery.trim() } : {}), ...(manuscriptNote.trim() ? { manuscriptNote: manuscriptNote.trim() } : {}) }); }
  async function copy() { if (report?.status !== "ok") return; try { await navigator.clipboard.writeText(plainTextBrief(report)); setCopyStatus("Brief copied."); } catch { setCopyStatus("Copy unavailable. Select the plain-text brief below to copy manually."); } }
  return <main id="main-content"><header className="masthead"><a className="wordmark" href="#main-content">Paper Neighbors</a><span>Audience-side reading research</span></header>
    <section className="intro"><h1>Find your next comparison read.</h1><p>Bring two film, TV or book references. Explore up to three books through Qloo audience evidence, then decide what holds up when you read them.</p><p>These are audience-side leads, not sales comps or a ready-to-submit query letter.</p></section>
    {demo && <p className="demo-notice" role="note"><strong>Synthetic demo mode.</strong> Invented books, facts, scores and traces. No Qloo or LLM requests are made.</p>}
    <section className="brief-section"><h2>Your references</h2><form onSubmit={submit}><fieldset disabled={running}><legend className="sr-only">Comparison brief</legend><div className="reference-fields"><label>Reference 1 (film, TV or book)<input required maxLength={200} value={first} onChange={e => setFirst(e.target.value)} /></label><label>Reference 2 (film, TV or book)<input required maxLength={200} value={second} onChange={e => setSecond(e.target.value)} /></label></div><p className="muted">Add the year or type in brackets if a title is ambiguous, e.g. Normal People (2020, TV)</p><label>Genre query<input value={genreQuery} maxLength={200} onChange={e => setGenreQuery(e.target.value)} /></label><p className="muted">You choose a returned book-genre tag before the books are researched.</p><label htmlFor="manuscript-note">Manuscript note (optional)</label><textarea id="manuscript-note" aria-describedby="note-help" value={manuscriptNote} maxLength={4000} onChange={e => setNote(e.target.value)} /><p id="note-help">stays in your browser brief; not sent to Qloo</p><button className="primary-button" disabled={running || !first.trim() || !second.trim()}>{running ? "Researching…" : "Find comparison reads"}</button></fieldset></form></section>
    <section className="results" aria-label="Comparison research" aria-busy={running}>{running && <p role="status">Researching audience evidence…</p>}{error && <p role="alert">{error}</p>}
      {report?.cachedRunAt && <p>cached result, run at {report.cachedRunAt} <button onClick={() => void run(report.input, true)}>Run live</button></p>}
      {report?.status === "needs_genre" && <div className="state-panel"><h2>Choose your book genre</h2><p>Select a returned tag. The choice is yours.</p>{report.options.map(genre => <button className="copy-button" key={genre.id} onClick={() => void run({ ...report.input, genre })}>{genre.name}</button>)}{!report.options.length && <p>No genre options returned. Try a more specific genre query.</p>}</div>}
      {report?.status === "ok" && <><div className="results-heading"><h2>Your comparison reading brief</h2><button className="copy-button" onClick={copy}>Copy brief</button></div><p>Genre: {report.genre.name}</p><p role="status">{copyStatus}</p>{copyStatus.startsWith("Copy unavailable") && <textarea aria-label="Plain-text brief" readOnly value={plainTextBrief(report)} />}
        <h3>Reference effect on results</h3>{report.references.map(ref => { if (report.unknowns.includes("Qloo did not return reference-effect data for this run")) return null; const effect = report.refEffect.find(item => item.refEntityId === ref.entityId); return <p key={ref.entityId}>{effect ? `${ref.name}: ${effect.score} (effect on top 10)` : `${ref.name} did not drive these results`}</p>; })}
        <div className="book-grid">{report.candidates.slice(0, 3).map(c => <BookCard key={c.book.entityId} candidate={c} references={report.references} />)}</div><section className="verify"><h3>Author to verify</h3>{report.unknowns.map(item => <label key={item}><input type="checkbox" />{item}</label>)}</section></>}
      {report && (report.status === "insufficient_candidates" || report.status === "evidence_unavailable") && <div className="state-panel"><h2>{report.status === "insufficient_candidates" ? "Too few supported books" : "Qloo evidence unavailable"}</h2><p>{report.reason}</p>{report.status === "insufficient_candidates" && <p>Supported candidates found: {report.found}</p>}<p>Try more specific references or another genre. No books have been invented to fill the brief.</p></div>}
      {report && <details><summary>Inspect research trace</summary><Trace trace={report.trace} /></details>}
      {!report && !running && !error && <p>Start with two references and a genre. Each reading lead comes with receipts and limits.</p>}
    </section><footer>Qloo affinity describes audience overlap. Read, verify and make your own comparison.</footer></main>;
}
