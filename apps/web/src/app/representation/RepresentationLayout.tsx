import { NavLink, Outlet } from 'react-router';

/**
 * The Representation section: routes (operational paths) and mandates with their versions,
 * coverage, coverage signers and authority events. None of these records is authority by existing,
 * a G1–G7 decision, readiness or a signature.
 */
export function RepresentationLayout() {
  return (
    <div className="directory">
      <nav aria-label="Representation" className="subnav">
        <ul>
          <li>
            <NavLink to="/representation/routes">Routes</NavLink>
          </li>
          <li>
            <NavLink to="/representation/mandates">Mandates</NavLink>
          </li>
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
