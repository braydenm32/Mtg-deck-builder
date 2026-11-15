"use client";

import { createContext, useContext } from "react";

/** Lets anything inside the new shell open ⌘K (the top bar's magnifier, the sidebar's search box). */
export const ShellContext = createContext<{ openSearch: () => void }>({ openSearch: () => {} });

export const useShell = () => useContext(ShellContext);
