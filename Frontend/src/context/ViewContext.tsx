import React, { createContext, useState } from "react";
import { ViewContextType } from "@/types/contextTypes/UserViewTypes";

const ViewContext = createContext<ViewContextType | undefined>(undefined);

const ViewProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeView, setActiveView] = useState<View>("Chat");

  return (
    <ViewContext.Provider value={{ activeView, setActiveView }}>
      {children}
    </ViewContext.Provider>
  );
};

export { ViewProvider, ViewContext };
