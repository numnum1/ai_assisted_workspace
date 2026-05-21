import type { Patcher } from "../../../utils/generics";
import type { Chat } from "./Chat";
import { useCallback } from "react";

// TODO: Implement, also needed is setChats probably
export function useTurnViewFunctions(id: string, setChat: Patcher<Chat>) {
  const fork = useCallback(
    (turnIndex: number) => {
      console.log(JSON.stringify({ turnIndex, id, setChat }));
    },
    [id, setChat],
  );
  const cut = useCallback(
    (turnIndex: number) => {
      console.log(JSON.stringify({ turnIndex, id, setChat }));
    },
    [id, setChat],
  );
  const deleteTurn = useCallback(
    (turnIndex: number) => {
      console.log(JSON.stringify({ turnIndex, id, setChat }));
    },
    [id, setChat],
  );
  const startNewThread = useCallback(
    (turnIndex: number) => {
      console.log(JSON.stringify({ turnIndex, id, setChat }));
    },
    [id, setChat],
  );
  const summarizeFromTurn = useCallback(
    (turnIndex: number) => {
      console.log(JSON.stringify({ turnIndex, id, setChat }));
    },
    [id, setChat],
  );

  return {
    fork,
    cut,
    deleteTurn,
    startNewThread,
    summarizeFromTurn,
  };
}
