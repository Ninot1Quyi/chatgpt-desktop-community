import React from "react";

export const LazyRightPanel = React.lazy(() =>
  import("@modules/workspace-panels").then((module) => ({
    default: module.RightPanel,
  })));

export const LazyRightPanelHeader = React.lazy(() =>
  import("@modules/workspace-panels").then((module) => ({
    default: module.RightPanelHeader,
  })));

export const LazyTerminalTab = React.lazy(() =>
  import("@modules/workspace-panels").then((module) => ({
    default: module.TerminalTab,
  })));
