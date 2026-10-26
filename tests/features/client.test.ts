import { afterEach, expect, it, vi } from "vitest";
import { comparablesBriefReportSchema, runComparablesBrief } from "../../lib/features/client";
import { createFixtureComparablesBrief, exampleBrief } from "../../lib/features/mock";
afterEach(() => vi.unstubAllGlobals());
it("posts a ComparablesBriefInput to the browser boundary", async () => {
  const report = createFixtureComparablesBrief(exampleBrief);
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => report });
  vi.stubGlobal("fetch", fetchMock);
  expect(await runComparablesBrief(exampleBrief)).toEqual(report);
  expect(fetchMock).toHaveBeenCalledWith("/api/agent", expect.objectContaining({ method: "POST", body: JSON.stringify(exampleBrief) }));
});
it("rejects a failed response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  await expect(runComparablesBrief(exampleBrief)).rejects.toThrow();
});

it("accepts a synthetic success fixture with valid identifiers and provenance", async () => {
  const input = { ...exampleBrief, genre: { id: "urn:tag:genre:media:psychological_thriller", name: "Psychological thriller (synthetic)" } };
  const report = createFixtureComparablesBrief(input);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => report }));
  expect(await runComparablesBrief(input)).toEqual(report);
});

it.each(['forged', 'search-book', 'failed-insights', 'reference-source', 'contribution', 'effect', 'duplicate-book', 'reference-book', 'trace', 'bad-reference-id', 'bad-evidence-id'])('rejects invalid provenance: %s', kind => {
  const report = createFixtureComparablesBrief({ ...exampleBrief, genre: { id: 'urn:tag:genre:media:psychological_thriller', name: 'Psychological thriller' } });
  if (report.status !== 'ok') throw Error('Expected success fixture');
  const c = report.candidates[0];
  if (kind === 'forged') { c.book.entityId = 'not-a-uuid'; c.book.name = 'Never returned'; c.facts.publisher = 'Invented Publisher'; c.book.sourceCall = 'synthetic-search'; }
  if (kind === 'search-book') c.book.sourceCall = 'synthetic-search';
  if (kind === 'failed-insights') report.trace[1].ok = false;
  if (kind === 'reference-source') report.references[0].sourceCall = 'synthetic-insights';
  if (kind === 'contribution') c.contributions[0].refEntityId = c.book.entityId;
  if (kind === 'effect') report.refEffect[0].refEntityId = c.book.entityId;
  if (kind === 'duplicate-book') report.candidates[1].book.entityId = c.book.entityId.toUpperCase();
  if (kind === 'reference-book') c.book.entityId = report.references[0].entityId;
  if (kind === 'trace') report.trace.push(report.trace[0]);
  if (kind === 'bad-reference-id') report.references[0].entityId = 'bad';
  if (kind === 'bad-evidence-id') c.evidence.push({ ...c.book, entityId: 'bad' });
  expect(comparablesBriefReportSchema.safeParse(report).success).toBe(false);
});
it('accepts case-insensitive UUID membership', () => {
  const report = createFixtureComparablesBrief({ ...exampleBrief, genre: { id: 'urn:tag:genre:media:psychological_thriller', name: 'Clockwork suspense (synthetic)' } });
  if (report.status !== 'ok') throw Error('Expected success fixture');
  const id = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  report.references[0].entityId = id.toUpperCase();
  report.candidates.forEach(c => { c.contributions[0].refEntityId = id; });
  report.refEffect[0].refEntityId = id;
  expect(comparablesBriefReportSchema.safeParse(report).success).toBe(true);
});

it.each(['forged-uuid', 'invented-search-citation', 'missing-self', 'wrong-source', 'wrong-name'])('rejects inconsistent citation catalog: %s', kind => {
  const report = createFixtureComparablesBrief({ ...exampleBrief, genre: { id: 'urn:tag:genre:media:psychological_thriller', name: 'Clockwork suspense (synthetic)' } });
  if (report.status !== 'ok') throw Error('Expected success fixture');
  const c = report.candidates[0];
  const invented = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  if (kind === 'forged-uuid') {
    c.book = { ...c.book, entityId: invented, name: 'Never returned' };
    c.facts.publisher = 'Invented Publisher';
  }
  if (kind === 'invented-search-citation') c.evidence = [{ ...report.references[0], entityId: invented, name: 'Never returned' }];
  if (kind === 'missing-self') c.evidence = [report.references[0]];
  if (kind === 'wrong-source') c.evidence = [{ ...c.book, sourceCall: report.references[0].sourceCall }];
  if (kind === 'wrong-name') c.evidence = [{ ...c.book, name: 'Never returned' }];
  expect(comparablesBriefReportSchema.safeParse(report).success).toBe(false);
});
it('accepts uppercase self-citations and citations of another candidate', () => {
  const report = createFixtureComparablesBrief({ ...exampleBrief, genre: { id: 'urn:tag:genre:media:psychological_thriller', name: 'Clockwork suspense (synthetic)' } });
  if (report.status !== 'ok') throw Error('Expected success fixture');
  report.candidates[0].evidence = [{ ...report.candidates[0].book, entityId: report.candidates[0].book.entityId.toUpperCase() }, report.candidates[1].book];
  expect(comparablesBriefReportSchema.safeParse(report).success).toBe(true);
});
