import { useSearchParams } from 'react-router';
import type { OperationalListView } from '@tb/contracts';

export function useOperationalView(
  parameter = 'view',
): [OperationalListView, (view: OperationalListView) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(parameter);
  const view: OperationalListView = raw === 'history' || raw === 'all' ? raw : 'operational';
  return [
    view,
    (nextView) => {
      const next = new URLSearchParams(params);
      if (nextView === 'operational') next.delete(parameter);
      else next.set(parameter, nextView);
      setParams(next);
    },
  ];
}

export function OperationalViewControl({
  value,
  onChange,
  id = 'operational-view',
}: {
  value: OperationalListView;
  onChange: (view: OperationalListView) => void;
  id?: string;
}) {
  return (
    <label className="list-filter" htmlFor={id}>
      View
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as OperationalListView)}
      >
        <option value="operational">Operational</option>
        <option value="history">History / inactive</option>
        <option value="all">All</option>
      </select>
      <span className="hint">
        Current operational scope: individual rights holders only. This is an operator policy, not
        an authority or readiness finding. History is retained.
      </span>
    </label>
  );
}
