"use client";

import HomeView from "@/components/views/HomeView.jsx";
import { useApp } from "@/lib/appContext";

export default function HomePage() {
  const app = useApp();
  return <HomeView onGoBoards={() => app.goTo("/board")} />;
}
