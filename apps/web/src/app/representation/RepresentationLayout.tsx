import { NavLink, Outlet } from 'react-router';

/**
 * The Representation section. Routes are available; mandates, versions, coverage and authority
 * events belong to the next phase and are listed only for orientation.
 */
export function RepresentationLayout() {
  return (
    <div className="directory">
      <nav aria-label="Representation" className="subnav">
        <ul>
          <li>
            <NavLink to="/representation/routes">Routes</NavLink>
          </li>
          <li aria-disabled="true" className="unavailable" data-testid="unavailable-subsection">
            Mandates <span className="badge">Not available yet</span>
          </li>
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
