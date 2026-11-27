/**
 * An error message as people read it (PRD §4.6): a name or symbol the message quotes in backticks (`x`) shows in
 * code style, without the backticks. The session file and the CLI keep the plain text.
 */
export function ErrorText({ message }: { readonly message: string }) {
  return <>{message.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</>;
}
