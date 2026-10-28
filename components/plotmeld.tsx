"use client";

import { Fragment, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { DEFAULT_EXAMPLE } from "../lib/default-example";
import { FAMILIARITY_MAX, MAX_GAMES, type GameCandidate, type NextGameInput, type NextGameReport, type QlooEvidence, type ReferenceOption, type ReferenceSlot, type RunNextGame } from "../lib/contracts";
import { runNextGame as apiRunNextGame } from "../lib/features/client";
import { score2 } from "../lib/format";
import { Trace } from "./trace";

type OkReport = Extract<NextGameReport, { status: "ok" }>;
const returned = (value: unknown) => value === undefined || value === null || value === "" ? "Not returned" : String(value);
const limits = ["Content similarity to either title", "That you will enjoy this game", "Price, hardware requirements or store availability"];
const wordingNote = "AI wording was unavailable for some games, so those reasons show Qloo's facts directly.";
const factLabel = (field: string) => field.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
function contributions(c: GameCandidate, references: QlooEvidence[]) {
  const [a, b] = references.map(ref => c.contributions.find(item => item.refEntityId === ref.entityId)?.score);
  const valid = a !== undefined && b !== undefined && Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b >= 0 && Number.isFinite(a + b) && a + b > 0;
  return { a, b, share: valid ? Math.round(100 * a / (a + b)) : undefined };
}
export function plainTextList(report: OkReport) {
  return ["Plotmeld", `A · ${report.references[0].name}`, `B · ${report.references[1].name}`, "Audience overlap, not content similarity.", ...(report.wording === "facts" ? [wordingNote] : []), ...report.candidates.slice(0, MAX_GAMES).map(c => {
    const { a, b, share } = contributions(c, report.references);
    return [c.game.name, `Platforms: ${c.facts.platforms?.length ? c.facts.platforms.join(", ") : "Not returned"}`, `Developer: ${returned(c.facts.developer)}`, `Publisher: ${returned(c.facts.publisher)}`, `Released: ${returned(c.facts.releaseDate)}`, `Audience overlap (Qloo affinity): ${c.game.affinity === undefined ? "Not returned" : score2(c.game.affinity)}`, `Per-reference contribution: ${share === undefined ? "Not returned" : `A ${share}%; B ${100 - share}%`}`, "Why this game:", ...c.reasons.map(r => `${r.text}${r.source === "facts" ? " (Qloo fact)" : ""}`), ...c.sharedTags.filter(t => t.tags.length).map(t => `Tags in common with ${report.references.find(r => r.entityId === t.refEntityId)?.name ?? t.refEntityId}: ${t.tags.join(", ")}`), "What each reason is based on:", ...c.groundedFacts.filter(f => c.reasons.some(r => r.factIds.includes(f.id))).map(f => `${factLabel(f.field)}: ${f.text}`), "You still cannot claim:", ...limits, `Entity ID: ${c.game.entityId}`, `Type: ${c.game.type}`, `Affinity: ${returned(c.game.affinity)}`, `Source call: ${c.game.sourceCall}`, `A contribution: ${returned(a)}`, `B contribution: ${returned(b)}`].join("\n");
  }), `Check before you buy:\n${report.unknowns.join("\n")}`].join("\n\n");
}
function GameCard({ candidate: c, references }: { candidate: GameCandidate; references: QlooEvidence[] }) {
  const [failed, setFailed] = useState(false);
  const { a, b, share } = contributions(c, references);
  return <article className="book-card game-card" aria-label={c.game.name}>
    <div className="cover">{c.game.imageUrl && !failed ?
      // eslint-disable-next-line @next/next/no-img-element -- Qloo art is rendered without an image proxy.
      <img src={c.game.imageUrl} alt={`Art for ${c.game.name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <div role="img" aria-label={`${c.game.name}: art unavailable`}>Art unavailable</div>}</div>
    <div className="book-body"><div className="game-main"><h3>{c.game.name}</h3><p className="platform-label">Platforms</p>
      {c.facts.platforms?.length ? <ul className="platforms" aria-label="Platforms" role="list">{c.facts.platforms.map((p, i) => <li key={i}>{p}</li>)}</ul> : <p>Not returned</p>}
      <dl className="facts">{[["Developer", c.facts.developer], ["Publisher", c.facts.publisher], ["Released", c.facts.releaseDate]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{returned(value)}</dd></div>)}</dl>
      <p className="game-score">Audience overlap (Qloo affinity): {c.game.affinity === undefined ? <span>Not returned</span> : <strong>{score2(c.game.affinity)}</strong>}</p><p className="muted">Audience co-affinity, not content similarity.</p>
      <h4>Per-reference contribution</h4>{share === undefined ? <p>Not returned</p> : <div className="contribution"><div className="split-labels" aria-hidden="true"><span>A · {references[0].name} {share}%</span><span>B · {references[1].name} {100 - share}%</span></div><div className="split" role="img" aria-label={`Show A: ${references[0].name}, ${share} percent; book B: ${references[1].name}, ${100 - share} percent`} style={{ "--share-a": `${share}%` } as CSSProperties}><span className="split-a" aria-hidden="true" /><span className="split-b" aria-hidden="true" /></div></div>}
      {c.sharedTags.filter(t => t.tags.length).map(t => <p key={t.refEntityId}>Tags in common with {references.find(r => r.entityId === t.refEntityId)?.name ?? t.refEntityId}: {t.tags.join(", ")}</p>)}
    </div><div className="game-detail"><h4>Why this game</h4><ul>{c.reasons.map((r, i) => <li key={i}>{r.text}{r.source === "facts" && <> <small className="muted">Qloo fact</small></>}</li>)}</ul>
      <details className="details"><summary>What each reason is based on</summary><ul>{c.groundedFacts.filter(f => c.reasons.some(r => r.factIds.includes(f.id))).map(f => <li key={f.id}><strong>{factLabel(f.field)}:</strong> {f.text}</li>)}</ul></details>
      <h4>You still cannot claim</h4><ul>{limits.map(item => <li key={item}>{item}</li>)}</ul>
      <details className="details"><summary>Inspect receipts</summary><ul className="evidence-list"><li><strong>{c.game.name}</strong><dl>{[["Entity ID", c.game.entityId], ["Type", c.game.type], ["Affinity", c.game.affinity], ["Source call", c.game.sourceCall], ["A contribution", a], ["B contribution", b]].map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{returned(value)}</dd></Fragment>)}</dl></li></ul></details>
    </div></div>
  </article>;
}
function SlipMark() {
  return <svg className="pn-mark" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
  <defs>
    <filter id="pn-g2b2-ink" x="-6%" y="-6%" width="112%" height="112%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".12 .19" numOctaves="2" seed="29" result="tooth"/>
      <feDisplacementMap in="SourceGraphic" in2="tooth" scale="2.2" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="pn-g2b2-ink-fine" x="-6%" y="-6%" width="112%" height="112%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".12 .19" numOctaves="2" seed="29" result="tooth"/>
      <feDisplacementMap in="SourceGraphic" in2="tooth" scale="1.0" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <path id="pn-g2b2-card-a" d="M40 23 Q90 22.6 142 23 Q152 23 152 33 L151.8 89 Q152 99 142 99 Q92 99.4 40 99 Q30 99 30 89 L30.2 33 Q30 23 40 23 Z"/>
    <path id="pn-g2b2-card-b" d="M98 47 Q129 46.6 160 47 Q170 47 170 57 L169.8 127 Q170 137 160 137 Q130 137.3 98 137 Q88 137 88 127 L88.2 57 Q88 47 98 47 Z"/>
    <clipPath id="pn-g2b2-clip-a" clipPathUnits="userSpaceOnUse"><use href="#pn-g2b2-card-a"/></clipPath>
    <clipPath id="pn-g2b2-clip-b" clipPathUnits="userSpaceOnUse"><use href="#pn-g2b2-card-b"/></clipPath>
  </defs>
  <g filter="url(#pn-g2b2-ink)" strokeLinecap="round" strokeLinejoin="round">
    <use href="#pn-g2b2-card-a" style={{ fill: 'var(--paper,#F8F1E6)' }}/>
    <use href="#pn-g2b2-card-b" style={{ fill: 'var(--paper,#F8F1E6)' }}/>
    <use href="#pn-g2b2-card-b" clipPath="url(#pn-g2b2-clip-a)" style={{ fill: 'var(--paper-2,#EDE2D1)' }}/>
    <g strokeWidth="1.5" style={{ fill: 'none', stroke: 'var(--ink,#2C211D)' }}>
      <use href="#pn-g2b2-card-a"/>
      <use href="#pn-g2b2-card-b"/>
      <path d="M58 39 Q68 38.7 78 39 L78 52 Q68 52.4 58 52 Z"/>
      <path d="M127 114 Q121 110.8 115 112 L115 124 Q121 122.8 127 126 Q133 122.8 139 124 L139 112 Q133 110.8 127 114 L127 126"/>
    </g>
    <path d="M66 42.5 L72 45.5 L66 49 Z" style={{ fill: 'var(--ink,#2C211D)' }}/>
    <path d="M41 29 Q89 28.7 141 29 M156 53 Q159 52.8 163 53" strokeWidth="1.3" style={{ fill: 'none', stroke: 'var(--stamp,#8E3A2E)' }}/>
  </g>
    <g filter="url(#pn-g2b2-ink-fine)" strokeLinecap="round" strokeLinejoin="round" clipPath="url(#pn-g2b2-clip-a)">
      <g clipPath="url(#pn-g2b2-clip-b)">
        <path d="M104.75 60 H109.25 Q111.5 60 111.5 62.25 V68.5 H117.75 Q120 68.5 120 70.75 V75.25 Q120 77.5 117.75 77.5 H111.5 V83.75 Q111.5 86 109.25 86 H104.75 Q102.5 86 102.5 83.75 V77.5 H96.25 Q94 77.5 94 75.25 V70.75 Q94 68.5 96.25 68.5 H102.5 V62.25 Q102.5 60 104.75 60 Z" strokeWidth="1" strokeLinejoin="miter" style={{ fill: 'var(--ink,#2C211D)', stroke: 'var(--ink,#2C211D)' }}/>
        <path d="M107 62 L104.75 66 H109.25 Z M107 84 L109.25 80 H104.75 Z M96 73 L100 75.25 V70.75 Z M118 73 L114 70.75 V75.25 Z" style={{ fill: 'var(--paper,#F8F1E6)' }}/>
        <circle cx="107" cy="73" r="1.8" style={{ fill: 'var(--paper,#F8F1E6)' }}/>
        <g style={{ fill: 'var(--slip-line,#4A1A15)' }}>
          <circle cx="133" cy="78" r="5"/>
          <circle cx="141" cy="70" r="5"/>
        </g>
        <g strokeWidth="1.1" style={{ fill: 'var(--accent,#7E2A22)', stroke: 'var(--ink,#2C211D)' }}>
          <circle cx="132" cy="77" r="5"/>
          <circle cx="140" cy="69" r="5"/>
        </g>
      </g>
    </g>
  <g style={{ fontFamily: "var(--mono,'DM Mono'),monospace", fontSize: '12px', fill: 'var(--ink,#2C211D)' }}>
    <text x="41" y="50">A</text>
    <text x="99" y="124">B</text>
  </g>
</svg>;
}
export function NextGame({ runNextGame = apiRunNextGame, demo = false }: { runNextGame?: RunNextGame; demo?: boolean }) {
  const [first, setFirst] = useState(DEFAULT_EXAMPLE.references[0]), [second, setSecond] = useState(DEFAULT_EXAMPLE.references[1]);
  const [familiarity, setFamiliarity] = useState<NonNullable<NextGameInput["familiarity"]>>("any");
  const [report, setReport] = useState<(NextGameReport & { cachedRunAt?: string }) | null>(null);
  const [running, setRunning] = useState(false), [error, setError] = useState(""), [copyStatus, setCopyStatus] = useState("");
  const [picked, setPicked] = useState<NonNullable<NextGameInput["choices"]>>({});
  const busy = useRef(false);
  async function run(input: NextGameInput, live = false) {
    if (busy.current) return;
    busy.current = true; setRunning(true); setError(""); setReport(null); setCopyStatus(""); setPicked({});
    try { setReport(await (live ? runNextGame(input, { live: true }) : runNextGame(input))); }
    catch (e) { setError(e instanceof Error && /^(Demo LLM budget reached|Demo Qloo budget reached|Too many searches)/.test(e.message) ? e.message : "Search interrupted. Check your connection and try again."); }
    finally { busy.current = false; setRunning(false); }
  }
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); void run({ references: [first.trim(), second.trim()], familiarity }); }
  function pick(slot: ReferenceSlot, option: ReferenceOption) {
    if (report?.status !== "needs_choice") return;
    const next = { ...picked, [slot]: option.entityId }; setPicked(next);
    if (slot === "screen") setFirst(option.label); else setSecond(option.label);
    if (report.choices.every(choice => next[choice.slot])) void run({ ...report.input, choices: { ...report.input.choices, ...next } });
  }
  async function copy() {
    if (report?.status !== "ok") return;
    try { await navigator.clipboard.writeText(plainTextList(report)); setCopyStatus("List copied."); }
    catch { setCopyStatus("Copy unavailable. Select the plain-text list below to copy manually."); }
  }
  return <main id="main-content"><header className="masthead"><a className="wordmark" href="#main-content">Plotmeld</a><span>Cross-media game finder</span></header>
    <section className="intro"><SlipMark /><h1>Find your next game.</h1><p>Bring one film or TV show and one book you love. No gaming history needed: Qloo audience data suggests up to three games, each with the reasons it returned.</p><p>Audience overlap, not a promise you will enjoy it. Check price, hardware and store yourself.</p></section>
    {demo && <p className="demo-notice" role="note">Synthetic demo mode. Invented games, facts, scores and traces. No Qloo or LLM requests are made.</p>}
    <section className="brief-section"><h2>Your references</h2><form onSubmit={submit}><fieldset disabled={running}><legend className="sr-only">Game search</legend><div className="reference-fields"><label>Film or TV title<input required maxLength={200} value={first} onChange={e => setFirst(e.target.value)} /></label><label>Book title<input required maxLength={200} value={second} onChange={e => setSecond(e.target.value)} /></label></div><fieldset className="familiarity"><legend>How familiar should the games be?</legend>{([ ["any", "Any (default)"], ["less", "Less familiar"], ["least", "Even less familiar"] ] as const).map(([value, label]) => <label key={value}><input type="radio" name="familiarity" value={value} checked={familiarity === value} onChange={() => setFamiliarity(value)} />{label}</label>)}<p className="muted">Uses Qloo&apos;s popularity score (0–1) as a ceiling: Less familiar ≤ 0.95, Even less familiar ≤ 0.9.</p></fieldset><p className="muted">Add the year or type in brackets if a title is ambiguous, e.g. {DEFAULT_EXAMPLE.references[0]}. Books resolve best by their English title.</p><button className="primary-button" disabled={running || !first.trim() || !second.trim()}>{running ? "Finding games…" : "Find my next game"}</button></fieldset></form></section>
    <section className="results" aria-label="Game recommendations" aria-busy={running}>
      {running && <><p role="status">Matching your show and book with Qloo audience data…</p><div aria-hidden="true" className="book-grid">{[0, 1, 2].map(i => <div key={i} style={{ minHeight: 180, borderBlock: "1px solid var(--ink)", padding: 24, background: "var(--paper-2)" }}><div style={{ width: "60%", height: 24, borderBottom: "1px solid var(--ink)" }} /><div style={{ width: "85%", height: 64, borderBottom: "1px solid var(--ink)" }} /></div>)}</div></>}
      {error && <p role="alert">{error}</p>}
      {report?.cachedRunAt && <p>cached result, run at {report.cachedRunAt} <button onClick={() => void run(report.input, true)}>Run live</button></p>}
      {report?.status === "needs_choice" && <div className="state-panel"><h2>Which one did you mean?</h2>{report.choices.map(choice => <fieldset key={choice.slot}><legend>{choice.slot === "screen" ? "Film or TV" : "Book"}: “{choice.query}”</legend><p>{choice.reason === "ambiguous" ? "Several titles share this name." : "No exact title match. Pick the closest, or edit the title."}</p>{choice.options.map(option => <button type="button" className="copy-button" aria-pressed={picked[choice.slot] === option.entityId} key={option.entityId} onClick={() => pick(choice.slot, option)}>{option.label}{option.disambiguation && <> <span style={{ fontFamily: "var(--mono)" }}>{option.disambiguation}</span></>}</button>)}</fieldset>)}</div>}
      {report?.status === "ok" && <><div className="results-heading"><h2>Your next games</h2><button className="copy-button" onClick={copy}>Copy list</button></div><p>A · {report.references[0].name}</p><p>B · {report.references[1].name}</p>{report.input.familiarity && report.input.familiarity !== "any" && <p className="muted">Familiarity: {report.input.familiarity === "less" ? "Less familiar" : "Even less familiar"} (Qloo popularity ≤ {FAMILIARITY_MAX[report.input.familiarity]})</p>}{copyStatus && <p role="status">{copyStatus}</p>}{copyStatus.startsWith("Copy unavailable") && <textarea aria-label="Plain-text list" readOnly value={plainTextList(report)} />}{report.wording === "facts" && <p className="muted">{wordingNote}</p>}{report.candidates.length < MAX_GAMES && <p className="muted">Qloo returned {report.candidates.length} supported game(s) for this pair.</p>}<div className="book-grid">{report.candidates.slice(0, MAX_GAMES).map(c => <GameCard key={c.game.entityId} candidate={c} references={report.references} />)}</div><section className="verify"><h3>Check before you buy</h3>{report.unknowns.map(item => <label key={item}><input type="checkbox" />{item}</label>)}</section></>}
      {report && (report.status === "insufficient_candidates" || report.status === "evidence_unavailable") && <div className="state-panel"><h2>{report.status === "insufficient_candidates" ? "Too few supported games" : "Qloo evidence unavailable"}</h2><p>{report.reason}</p>{report.status === "insufficient_candidates" && <p>Supported candidates found: {report.found}</p>}<p>No games have been invented to fill the gap.</p></div>}
      {report && <details><summary>Inspect research trace</summary><Trace trace={report.trace} /></details>}
      {!report && !running && !error && <p>Start with one film or TV title and one book. Each game comes with receipts and limits.</p>}
    </section><footer>Qloo affinity describes audience overlap. Check price, hardware and store yourself.</footer></main>;
}
