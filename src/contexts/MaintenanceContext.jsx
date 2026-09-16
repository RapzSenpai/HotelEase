/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { subscribeToMaintenanceStatus } from "@/services/maintenanceService";

/**
 * One live maintenance subscription for the whole app.
 *
 * Previously every route was wrapped in <MaintenanceRoute>, which fetched the
 * maintenance doc on every mount (an extra Firestore read plus a loader flash
 * per navigation). Subscribing once here keeps the state fresh without that.
 */
const MaintenanceContext = createContext({ enabled: false, loading: true });

export function MaintenanceProvider({ children }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToMaintenanceStatus((status) => {
      setEnabled(Boolean(status.enabled));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const value = useMemo(() => ({ enabled, loading }), [enabled, loading]);

  return (
    <MaintenanceContext.Provider value={value}>
      {children}
    </MaintenanceContext.Provider>
  );
}

export function useMaintenance() {
  return useContext(MaintenanceContext);
}
