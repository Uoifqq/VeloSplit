"use client";

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ClusterMoniker } from "../lib/solana-client";
import { CLUSTERS } from "../lib/solana-client";
import { getExplorerUrl } from "../lib/explorer";

type ClusterContextValue = {
  cluster: ClusterMoniker;
  setCluster: (cluster: ClusterMoniker) => void;
  getExplorerUrl: (path: string) => string;
};

const ClusterContext = createContext<ClusterContextValue | null>(null);

function readStoredCluster(): ClusterMoniker {
  return "devnet";
}

function getServerCluster(): ClusterMoniker {
  return "devnet";
}

function subscribeCluster() { return () => {}; }

export { CLUSTERS };

export function ClusterProvider({ children }: { children: ReactNode }) {
  const cluster = useSyncExternalStore(
    subscribeCluster,
    readStoredCluster,
    getServerCluster
  );

  const setCluster = useCallback<ClusterContextValue["setCluster"]>(() => {}, []);

  const explorerUrl = useCallback(
    (path: string) => getExplorerUrl(path, cluster),
    [cluster]
  );

  return (
    <ClusterContext.Provider
      value={{ cluster, setCluster, getExplorerUrl: explorerUrl }}
    >
      {children}
    </ClusterContext.Provider>
  );
}

export function useCluster() {
  const ctx = useContext(ClusterContext);
  if (!ctx) throw new Error("useCluster must be used within ClusterProvider");
  return ctx;
}
