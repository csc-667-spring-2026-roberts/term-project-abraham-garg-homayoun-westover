const button = document.getElementById("loadBtn") as HTMLButtonElement | null;
const container = document.getElementById("container");
const template = document.getElementById("itemTemplate") as HTMLTemplateElement | null;

/** Minimal client store: DOM + console for visibility during development */
const store = {
  appendGameFromServer(gameId: number): void {
    if (!container || !template) {
      return;
    }
    const existing = container.querySelector(`[data-game-id="${String(gameId)}"]`);
    if (existing) {
      return;
    }

    const clone = template.content.cloneNode(true) as HTMLElement;
    const nameEl = clone.querySelector(".name");
    if (nameEl) {
      const btn = document.createElement("button");
      btn.textContent = `Game #${String(gameId)} — Join`;
      btn.addEventListener("click", () => {
        void fetch(`/api/games/${String(gameId)}/join`, { method: "POST" }).then(() => {
          window.location.href = `/game/${String(gameId)}`;
        });
      });
      nameEl.appendChild(btn);
    }
    const root = clone.firstElementChild as HTMLElement | null;
    if (root) {
      root.dataset.gameId = String(gameId);
    }
    container.appendChild(clone);
  },
};

if (button && container && template) {
  const source = new EventSource("/api/sse?roomId=global");

  source.addEventListener("state-update", (event: MessageEvent<string>) => {
    try {
      const data = JSON.parse(event.data) as {
        type?: string;
        game?: { id?: number };
        gameId?: number;
      };

      if (data.type === "game_created" && typeof data.game?.id === "number") {
        store.appendGameFromServer(data.game.id);
      }
    } catch {
      /* ignore malformed SSE payloads */
    }
  });

  source.addEventListener("error", () => {
    // EventSource reconnects automatically; no custom backoff in this milestone.
  });

  button.addEventListener("click", () => {
    void (async (): Promise<void> => {
      const res = await fetch("/api/games", {
        method: "POST",
      });

      if (!res.ok) {
        return;
      }

      const game = (await res.json()) as { id: number };
      window.location.href = `/game/${String(game.id)}`;
    })();
  });
}
