/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIVEKIT_URL?: string;
  readonly VITE_LIVEKIT_TOKEN_ENDPOINT?: string;
  readonly VITE_VIDEO_PROVIDER?: 'local' | 'livekit';
  readonly VITE_RPPG_API_URL?: string;
  readonly VITE_USE_MOCK_RPPG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
