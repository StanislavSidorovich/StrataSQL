// The author's name with links to GitHub and LinkedIn (bottom of the model panel, welcome card, About).

export const GITHUB_URL = 'https://github.com/StanislavSidorovich/StrataSQL'
export const LINKEDIN_URL = 'https://www.linkedin.com/in/stanislavsidorovich'
/** Feedback form (Google Forms: no account needed). Empty: the Feedback entries stay hidden. */
export const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfkR1REM9D50DP1eXoYXUqCDtOT_at7qzb319CeVz3tvzbjbw/viewform'

export function AuthorLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`author-links ${className}`}>
      Made by Stanislav Sidorovich ·{' '}
      <a href={GITHUB_URL} target="_blank" rel="noopener">
        GitHub
      </a>{' '}
      ·{' '}
      <a href={LINKEDIN_URL} target="_blank" rel="noopener">
        LinkedIn
      </a>
    </p>
  )
}
