"use client";
import { ComparablesBrief } from "../components/paper-neighbors";
import { mockRunComparablesBrief } from "../lib/features/mock";
export default function Home() {
  const demo = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_PAPER_NEIGHBORS_DEMO === "true";
  return <ComparablesBrief demo={demo} runComparablesBrief={demo ? mockRunComparablesBrief : undefined} />;
}
