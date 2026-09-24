import { NavLink, Outlet } from 'react-router';

/** The Directory section: its record types as a sub-navigation above the current page. */
export function DirectoryLayout() {
  return (
    <div className="directory">
      <nav aria-label="Directory" className="subnav">
        <ul>
          <li>
            <NavLink to="/directory/agencies">Agencies</NavLink>
          </li>
          <li>
            <NavLink to="/directory/owners">Owners</NavLink>
          </li>
          <li>
            <NavLink to="/directory/legal-subjects">Legal subjects</NavLink>
          </li>
          <li>
            <NavLink to="/directory/signers">Signers</NavLink>
          </li>
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
