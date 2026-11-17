"use client";

import dynamic from "next/dynamic";

const GameView = dynamic(() => import("./GameView"), {
  ssr: false,
  loading: () => (
    <div className="grid h-screen place-items-center bg-[#04101c] text-lg tracking-widest text-amber-200">AETHER TIDE yuklanmoqda…</div>
  ),
});

export default function GameLoader() {
  return <GameView />;
}
