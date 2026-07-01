"use client";

import BoardListView from "@/components/views/BoardListView.jsx";
import { useApp } from "@/lib/appContext";

export default function BoardIndexPage() {
  const app = useApp();
  return (
    <BoardListView
      boards={app.boards}
      onSelectBoard={app.selectBoard}
      onInitBoard={app.openInitBoard}
    />
  );
}
