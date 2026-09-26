// Supabase Auth UI setup for /login: theme variables (colors, fonts, sizes)
// + our CSS module classes for the chunky 3D look (see AuthForm.module.css).
import { ThemeSupa } from '@supabase/auth-ui-shared'
import styles from '@/components/auth/AuthForm.module.css'

const FONT = "var(--font-app), 'Nunito', ui-rounded, system-ui, sans-serif"

export const APPEARANCE = {
  theme: ThemeSupa,
  className: {
    anchor: styles.anchor,
    button: styles.button,
    divider: styles.divider,
    input: styles.input,
    label: styles.label,
    message: styles.message,
  },
  variables: {
    default: {
      colors: {
        brand: 'var(--st-green)',
        brandAccent: 'var(--st-green-dark)',
        brandButtonText: '#ffffff',
        defaultButtonBackground: 'var(--st-surface)',
        defaultButtonBackgroundHover: 'var(--st-bg)',
        defaultButtonBorder: 'var(--st-line)',
        defaultButtonText: 'var(--st-ink)',
        dividerBackground: 'var(--st-line)',
        inputBackground: 'var(--st-bg)',
        inputBorder: 'var(--st-line)',
        inputBorderHover: '#d0d0d0',
        inputBorderFocus: 'var(--st-blue)',
        inputText: 'var(--st-ink)',
        inputLabelText: 'var(--st-ink)',
        inputPlaceholder: '#9a9a9a',
        messageText: '#2b7a0b',
        messageBackground: 'var(--st-green-bg)',
        messageBorder: 'var(--st-green)',
        messageTextDanger: '#c62828',
        messageBackgroundDanger: 'var(--st-red-bg)',
        messageBorderDanger: 'var(--st-red)',
        anchorTextColor: '#0a6fa3',
        anchorTextHoverColor: 'var(--st-blue-dark)',
      },
      space: {
        labelBottomMargin: '6px',
        anchorBottomMargin: '0px',
        buttonPadding: '12px 16px',
        inputPadding: '12px 14px',
      },
      borderWidths: {
        buttonBorderWidth: '2px',
        inputBorderWidth: '2px',
      },
      radii: {
        borderRadiusButton: '16px',
        buttonBorderRadius: '16px',
        inputBorderRadius: '14px',
      },
      fontSizes: {
        baseBodySize: '15px',
        baseInputSize: '16px', // ≥ 16px: no zoom-on-focus on iOS
        baseLabelSize: '15px',
        baseButtonSize: '15px',
      },
      fonts: {
        bodyFontFamily: FONT,
        buttonFontFamily: FONT,
        inputFontFamily: FONT,
        labelFontFamily: FONT,
      },
    },
  },
}

export const LOCALIZATION = {
  variables: {
    sign_in: {
      email_label: 'Email address',
      password_label: 'Password',
      email_input_placeholder: 'you@example.com',
      password_input_placeholder: 'Your password',
      button_label: 'Sign in',
      loading_button_label: 'Signing in…',
      social_provider_text: 'Continue with {{provider}}',
      link_text: 'Already have an account? Sign in',
    },
    sign_up: {
      email_label: 'Email address',
      password_label: 'Create a password',
      email_input_placeholder: 'you@example.com',
      password_input_placeholder: 'At least 6 characters',
      button_label: 'Sign up',
      loading_button_label: 'Creating your account…',
      social_provider_text: 'Continue with {{provider}}',
      link_text: "Don't have an account? Sign up",
      confirmation_text: 'Check your email for the confirmation link',
    },
    forgotten_password: {
      email_label: 'Email address',
      email_input_placeholder: 'you@example.com',
      button_label: 'Send reset instructions',
      loading_button_label: 'Sending…',
      link_text: 'Forgot your password?',
      confirmation_text: 'Check your email for the password reset link',
    },
  },
}
