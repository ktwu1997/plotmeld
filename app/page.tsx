"use client";
import { NextGame } from "../components/plotmeld";
import { mockRunNextGame } from "../lib/features/mock";
export default function Home() {
  const demo = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_PLOTMELD_DEMO === "true";
  return <NextGame demo={demo} runNextGame={demo ? mockRunNextGame : undefined} />;
}
