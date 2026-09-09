export {};

interface GoogleIdCredentialResponse {
  credential: string;
  select_by?: string;
}

interface GoogleIdInitConfig {
  client_id: string;
  callback: (response: GoogleIdCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

interface GoogleIdButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdInitConfig) => void;
          renderButton: (parent: HTMLElement, options: GoogleIdButtonOptions) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}
