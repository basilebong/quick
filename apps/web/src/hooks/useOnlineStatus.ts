import { useEffect, useState } from "react";

const getInitial = (): boolean => (typeof navigator === "undefined" ? true : navigator.onLine);

export const useOnlineStatus = (): boolean => {
  const [online, setOnline] = useState<boolean>(getInitial);
  useEffect(() => {
    setOnline(getInitial());
    const onOnline = (): void => setOnline(true);
    const onOffline = (): void => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  return online;
};
