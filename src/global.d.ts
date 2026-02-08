declare const chrome: {
  storage: {
    sync: {
      get: (keys: string | string[] | null, callback: (result: Record<string, unknown>) => void) => void;
      set: (items: Record<string, unknown>, callback?: () => void) => void;
    };
    onChanged: {
      addListener: (
        callback: (
          changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
          areaName: "sync" | "local" | "managed" | "session"
        ) => void
      ) => void;
    };
  };
  runtime: {
    openOptionsPage: () => void;
    getURL: (path: string) => string;
    sendMessage: (
      message: unknown,
      responseCallback?: (response: unknown) => void
    ) => void;
    onMessage: {
      addListener: (
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response: unknown) => void
        ) => boolean | void
      ) => void;
    };
  };
  action: {
    onClicked: {
      addListener: (callback: () => void) => void;
    };
  };
  commands: {
    onCommand: {
      addListener: (callback: (command: string) => void) => void;
    };
  };
  tabs: {
    query: (
      queryInfo: { active?: boolean; currentWindow?: boolean },
      callback: (tabs: Array<{ id?: number }>) => void
    ) => void;
    sendMessage: (
      tabId: number,
      message: unknown,
      responseCallback?: (response: unknown) => void
    ) => void;
  };
  scripting: {
    executeScript: (details: {
      target: { tabId: number };
      files?: string[];
      func?: (...args: any[]) => any;
      args?: any[];
    }) => Promise<unknown>;
  };
};
