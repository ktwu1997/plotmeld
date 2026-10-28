// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { NextGame, plainTextList } from "../../components/plotmeld";
import { createFixtureNextGame, exampleInput, mockRunNextGame } from "../../lib/features/mock";
import type { RunNextGame } from "../../lib/contracts";

// The backend browser boundary may be changing in the shared worktree.
vi.mock("../../lib/features/client", () => ({ runNextGame: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const ok = () => {
  const report = createFixtureNextGame();
  if (report.status !== "ok") throw new Error("Expected ok fixture");
  return report;
};
const submit = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Find my next game" }));
it("renders three game cards, verbatim facts, stamps, shares, grounded reasons and missing fields; copies the list", async () => {
  const user = userEvent.setup(); const report = ok();
  render(<NextGame demo runNextGame={async () => report} />); await submit(user);
  const cards = await screen.findAllByRole("article"); expect(cards).toHaveLength(3);
  const card = within(cards[0]);
  expect(cards[0]).toHaveAccessibleName("Mock Game One (synthetic)");
  for (const text of ["Mock Developer (synthetic)", "Mock Publisher (synthetic)", "2024-02-03", "Mock Platform Alpha", "Mock Platform Beta", "Qloo fact"]) expect(card.getByText(text)).toBeVisible();
  expect(card.getByRole("list", { name: "Platforms" }).children).toHaveLength(2);
  expect(card.getByRole("img", { name: "Show A: Mock Screen (synthetic), 62 percent; book B: Mock Book (synthetic), 38 percent" })).toHaveStyle({ "--share-a": "62%" });
  expect(card.getByText("A · Mock Screen (synthetic) 62%")).toBeVisible();
  expect(card.getByText("B · Mock Book (synthetic) 38%")).toBeVisible();
  expect(cards[0].querySelector(".game-score strong")).toHaveTextContent(/^0\.79$/);
  expect(screen.getByText(/AI wording was unavailable/)).toBeVisible();
  expect(card.getByText("Tags in common with Mock Screen (synthetic): tag-alpha")).toBeVisible();
  await user.click(card.getByText("What each reason is based on"));
  expect(card.getByText("Affinity:")).toBeVisible();
  await user.click(card.getByText("Inspect receipts"));
  expect(card.getByText(String(report.candidates[0].game.affinity))).toBeVisible();
  const missing = within(cards[2]);
  expect(missing.getByText("Art unavailable")).toBeVisible();
  for (const label of ["Developer", "Publisher", "Released"]) expect(missing.getByText(label).nextElementSibling).toHaveTextContent("Not returned");
  expect(cards[2].querySelector(".platform-label")?.nextElementSibling).toHaveTextContent("Not returned");
  expect(missing.queryByRole("img", { name: /Show A/ })).not.toBeInTheDocument();
  expect(cards[2].querySelector(".game-score span")).toHaveTextContent("Not returned");
  await user.click(screen.getByRole("button", { name: "Copy list" }));
  expect(await navigator.clipboard.readText()).toBe(plainTextList(report));
  for (const text of ["Developer: Mock Developer (synthetic)", "Per-reference contribution: A 62%; B 38%", "Why this game:", "Qloo fact", "Check before you buy:", "A contribution: 0.62"]) expect(plainTextList(report)).toContain(text);
  expect(document.body.textContent?.toLowerCase()).not.toContain("niche");
});
it("handles art load failure", async () => {
  const report = ok(); report.candidates[0].game.imageUrl = "https://invalid.example/synthetic.png";
  const user = userEvent.setup(); render(<NextGame runNextGame={async () => report} />); await submit(user);
  fireEvent.error(await screen.findByAltText("Art for Mock Game One (synthetic)"));
  expect(screen.getByRole("img", { name: "Mock Game One (synthetic): art unavailable" })).toBeVisible();
});
it.each([undefined, -1, NaN, Infinity, 0])("omits an invalid split for %s", async value => {
  const report = ok(); report.candidates[0].contributions = value === undefined ? [] : [{ refEntityId: report.references[0].entityId, score: value }, { refEntityId: report.references[1].entityId, score: 0 }];
  const user = userEvent.setup(); render(<NextGame runNextGame={async () => report} />); await submit(user);
  const card = (await screen.findAllByRole("article"))[0];
  expect(card.querySelector(".contribution")).toBeNull();
  expect(within(card).getByText("Per-reference contribution").nextElementSibling).toHaveTextContent("Not returned");
});
it.each([1, 2])("waits for all %s choice slots and preserves earlier choices", async count => {
  const report = createFixtureNextGame(exampleInput, "needs_choice");
  if (report.status !== "needs_choice") throw new Error("Expected choices");
  report.choices = report.choices.slice(0, count); report.input = { ...report.input, choices: { book: "earlier-synthetic-choice" } };
  const run = vi.fn<RunNextGame>().mockResolvedValueOnce(report).mockResolvedValueOnce(ok());
  const user = userEvent.setup(); render(<NextGame runNextGame={run} />); await submit(user);
  expect(await screen.findByRole("heading", { name: "Which one did you mean?" })).toBeVisible();
  expect(screen.getByText("Several titles share this name.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Mock screen Choice (synthetic) synthetic edition" }));
  if (count === 2) {
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Film or TV title")).toHaveValue("Mock screen Choice (synthetic)");
    expect(screen.getByText("No exact title match. Pick the closest, or edit the title.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Mock book Choice (synthetic) synthetic edition" }));
  }
  expect(await screen.findAllByRole("article")).toHaveLength(3);
  expect(run).toHaveBeenNthCalledWith(2, { references: report.input.references, choices: { screen: "synthetic-ref-0", book: count === 2 ? "synthetic-ref-1" : "earlier-synthetic-choice" } });
});
it.each(["insufficient_candidates", "evidence_unavailable"] as const)("renders %s", async status => {
  const user = userEvent.setup(); render(<NextGame runNextGame={async () => createFixtureNextGame(exampleInput, status)} />); await submit(user);
  expect(await screen.findByRole("heading", { name: status === "insufficient_candidates" ? "Too few supported games" : "Qloo evidence unavailable" })).toBeVisible();
  expect(screen.getByText("No games have been invented to fill the gap.")).toBeVisible();
  if (status === "insufficient_candidates") expect(screen.getByText("Supported candidates found: 0")).toBeVisible();
  expect(screen.queryAllByRole("article")).toHaveLength(0);
});
it.each(["network", "500", "Demo LLM budget reached for this month; cached example still available", "Demo Qloo budget reached; try later", "Too many searches right now. Wait a minute and try again."])("shows the %s error", async message => {
  const user = userEvent.setup(); render(<NextGame runNextGame={async () => { throw new Error(message); }} />); await submit(user);
  expect(await screen.findByRole("alert")).toHaveTextContent(/^(Demo|Too many)/.test(message) ? message : "Search interrupted. Check your connection and try again.");
});
it("shows a calm loading ledger and prevents empty input", async () => {
  const user = userEvent.setup(); render(<NextGame runNextGame={() => new Promise(() => {})} />);
  const field = screen.getByLabelText("Book title"); const button = screen.getByRole("button", { name: "Find my next game" });
  await user.clear(field); expect(button).toBeDisabled(); await user.type(field, "Mock Book"); await submit(user);
  expect(screen.getByRole("status")).toHaveTextContent("Matching your show and book with Qloo audience data…");
  expect(document.querySelectorAll('.book-grid > div')).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Finding games…" })).toBeDisabled();
});
it("offers manual copy and reports fewer cards", async () => {
  const user = userEvent.setup(); vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
  const report = ok(); report.candidates = report.candidates.slice(0, 1);
  render(<NextGame runNextGame={async () => report} />); await submit(user);
  await user.click(await screen.findByRole("button", { name: "Copy list" }));
  expect(await screen.findByLabelText("Plain-text list")).toHaveValue(plainTextList(report));
  expect(screen.getByText("Qloo returned 1 supported game(s) for this pair.")).toBeVisible();
});
it("disables synthetic fixtures in production", async () => {
  vi.stubEnv("NODE_ENV", "production"); await expect(mockRunNextGame(exampleInput)).rejects.toThrow("disabled in production");
});
it("preserves the baseline SlipMark SVG outerHTML", () => {
  const { container } = render(<NextGame runNextGame={mockRunNextGame} />);
  expect(container.querySelector("svg.pn-mark")?.outerHTML).toMatchInlineSnapshot(`"<svg class="pn-mark" viewBox="0 0 200 150" aria-hidden="true" focusable="false"><defs><filter id="pn-g2b2-ink" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".12 .19" numOctaves="2" seed="29" result="tooth"></feTurbulence><feDisplacementMap in="SourceGraphic" in2="tooth" scale="2.2" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap></filter><filter id="pn-g2b2-ink-fine" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".12 .19" numOctaves="2" seed="29" result="tooth"></feTurbulence><feDisplacementMap in="SourceGraphic" in2="tooth" scale="1.0" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap></filter><path id="pn-g2b2-card-a" d="M40 23 Q90 22.6 142 23 Q152 23 152 33 L151.8 89 Q152 99 142 99 Q92 99.4 40 99 Q30 99 30 89 L30.2 33 Q30 23 40 23 Z"></path><path id="pn-g2b2-card-b" d="M98 47 Q129 46.6 160 47 Q170 47 170 57 L169.8 127 Q170 137 160 137 Q130 137.3 98 137 Q88 137 88 127 L88.2 57 Q88 47 98 47 Z"></path><clipPath id="pn-g2b2-clip-a" clipPathUnits="userSpaceOnUse"><use href="#pn-g2b2-card-a"></use></clipPath><clipPath id="pn-g2b2-clip-b" clipPathUnits="userSpaceOnUse"><use href="#pn-g2b2-card-b"></use></clipPath></defs><g filter="url(#pn-g2b2-ink)" stroke-linecap="round" stroke-linejoin="round"><use href="#pn-g2b2-card-a" style="fill: var(--paper,#F8F1E6);"></use><use href="#pn-g2b2-card-b" style="fill: var(--paper,#F8F1E6);"></use><use href="#pn-g2b2-card-b" clip-path="url(#pn-g2b2-clip-a)" style="fill: var(--paper-2,#EDE2D1);"></use><g stroke-width="1.5" style="fill: none; stroke: var(--ink,#2C211D);"><use href="#pn-g2b2-card-a"></use><use href="#pn-g2b2-card-b"></use><path d="M58 39 Q68 38.7 78 39 L78 52 Q68 52.4 58 52 Z"></path><path d="M127 114 Q121 110.8 115 112 L115 124 Q121 122.8 127 126 Q133 122.8 139 124 L139 112 Q133 110.8 127 114 L127 126"></path></g><path d="M66 42.5 L72 45.5 L66 49 Z" style="fill: var(--ink,#2C211D);"></path><path d="M41 29 Q89 28.7 141 29 M156 53 Q159 52.8 163 53" stroke-width="1.3" style="fill: none; stroke: var(--stamp,#8E3A2E);"></path></g><g filter="url(#pn-g2b2-ink-fine)" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#pn-g2b2-clip-a)"><g clip-path="url(#pn-g2b2-clip-b)"><path d="M104.75 60 H109.25 Q111.5 60 111.5 62.25 V68.5 H117.75 Q120 68.5 120 70.75 V75.25 Q120 77.5 117.75 77.5 H111.5 V83.75 Q111.5 86 109.25 86 H104.75 Q102.5 86 102.5 83.75 V77.5 H96.25 Q94 77.5 94 75.25 V70.75 Q94 68.5 96.25 68.5 H102.5 V62.25 Q102.5 60 104.75 60 Z" stroke-width="1" stroke-linejoin="miter" style="fill: var(--ink,#2C211D); stroke: var(--ink,#2C211D);"></path><path d="M107 62 L104.75 66 H109.25 Z M107 84 L109.25 80 H104.75 Z M96 73 L100 75.25 V70.75 Z M118 73 L114 70.75 V75.25 Z" style="fill: var(--paper,#F8F1E6);"></path><circle cx="107" cy="73" r="1.8" style="fill: var(--paper,#F8F1E6);"></circle><g style="fill: var(--slip-line,#4A1A15);"><circle cx="133" cy="78" r="5"></circle><circle cx="141" cy="70" r="5"></circle></g><g stroke-width="1.1" style="fill: var(--accent,#7E2A22); stroke: var(--ink,#2C211D);"><circle cx="132" cy="77" r="5"></circle><circle cx="140" cy="69" r="5"></circle></g></g></g><g style="font-family: var(--mono,'DM Mono'),monospace; font-size: 12px; fill: var(--ink,#2C211D);"><text x="41" y="50">A</text><text x="99" y="124">B</text></g></svg>"`);
});
it.each([0, 100])("renders a valid %s percent endpoint split", async share => {
  const report = ok();
  report.candidates[0].contributions = report.references.map((ref, i) => ({ refEntityId: ref.entityId, score: i === 0 ? share : 100 - share }));
  const user = userEvent.setup(); render(<NextGame runNextGame={async () => report} />); await submit(user);
  expect((await screen.findAllByRole("article"))[0].querySelector(".split")).toHaveStyle({ "--share-a": `${share}%` });
});
it("omits the fallback wording note for LLM reasons", async () => {
  const report = ok(); report.wording = "llm"; report.candidates.forEach(c => c.reasons.forEach(r => { r.source = "llm"; }));
  const user = userEvent.setup(); render(<NextGame runNextGame={async () => report} />); await submit(user);
  await screen.findAllByRole("article");
  expect(screen.queryByText(/AI wording was unavailable/)).not.toBeInTheDocument();
  expect(screen.queryByText("Qloo fact")).not.toBeInTheDocument();
});

it.each(['less', 'least'] as const)("sends familiarity %s, preserves it through choices and live runs, and shows its result note", async familiarity => {
  const report = createFixtureNextGame({ ...exampleInput, familiarity }, "needs_choice");
  if (report.status !== "needs_choice") throw Error("Expected choices");
  report.choices = report.choices.slice(0, 1);
  const result = { ...ok(), input: report.input, cachedRunAt: "2026-10-28" };
  const run = vi.fn<RunNextGame>().mockResolvedValueOnce(report).mockResolvedValue(result);
  const user = userEvent.setup(); render(<NextGame runNextGame={run} />);
  expect(screen.getByRole("radio", { name: "Any (default)" })).toBeChecked();
  expect(screen.getByLabelText("Book title")).toHaveValue("The Secret History (1992, book)");
  expect(screen.getByText(/Books resolve best by their English title/)).toBeVisible();
  await user.click(screen.getByRole("radio", { name: familiarity === "less" ? "Less familiar" : "Even less familiar" }));
  await submit(user); expect(run.mock.calls[0][0].familiarity).toBe(familiarity);
  await user.click(await screen.findByRole("button", { name: "Mock screen Choice (synthetic) synthetic edition" }));
  await screen.findAllByRole("article"); expect(run.mock.calls[1][0].familiarity).toBe(familiarity);
  expect(screen.getByText(`Familiarity: ${familiarity === "less" ? "Less familiar" : "Even less familiar"} (Qloo popularity ≤ ${familiarity === "less" ? "0.95" : "0.9"})`)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Run live" }));
  expect(run).toHaveBeenNthCalledWith(3, result.input, { live: true });
});
