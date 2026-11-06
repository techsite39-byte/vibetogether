import { Link } from 'react-router-dom'
import PageIntro from '../components/common/PageIntro.jsx'

export default function NotFound() {
  return (
    <>
      <PageIntro
        title="Page Not Found"
        description="We couldn’t find the page you were looking for. It may have moved or the address may be incorrect."
      />
      <div className="page-action container">
        <Link className="button button--primary" to="/">
          Return home
        </Link>
      </div>
    </>
  )
}
