import { createContext, useContext } from "react";

import type { OwnerUser } from "@/lib/me-api";

const OwnerContext = createContext<OwnerUser | null>(null);

export const OwnerProvider = OwnerContext.Provider;

export const useOwner = (): OwnerUser => {
  const owner = useContext(OwnerContext);
  if (owner === null) throw new Error("useOwner must be used within an authenticated route");
  return owner;
};
