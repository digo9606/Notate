import React from "react";

export interface ViewContextType {
  activeView: View;
  setActiveView: React.Dispatch<React.SetStateAction<View>>;
}
