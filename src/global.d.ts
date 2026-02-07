declare const chrome: {
  storage: {
    sync: {
      get: (keys: string | string[] | null, callback: (result: Record<string, unknown>) => void) => void;
      set: (items: Record<string, unknown>, callback?: () => void) => void;
    };
  };
  runtime: {
    openOptionsPage: () => void;
  };
  action: {
    onClicked: {
      addListener: (callback: () => void) => void;
    };
  };
};
