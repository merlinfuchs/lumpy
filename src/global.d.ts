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
};
