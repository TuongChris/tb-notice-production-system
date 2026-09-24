// Names of related records shown next to their ids (a route's agency, owner and subject, a source's
// agency or scope). Each record is fetched once per page and shared by every cell that shows it; a
// record that cannot be loaded is shown as an explicit fallback, never as a guessed name.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { OwnerSubject } from '@tb/contracts';
import { useDirectoryApi } from './hooks.js';

export type LookupKind = 'agency' | 'owner' | 'legalSubject' | 'signer' | 'ownerSubject';

type Loaded = { readonly name: string } | { readonly failed: true };

interface LookupCache {
  get(kind: LookupKind, id: string): Promise<Loaded>;
  ownerSubject(id: string): Promise<OwnerSubject | null>;
}

const LookupContext = createContext<LookupCache | null>(null);

export function LookupProvider({ children }: { children: ReactNode }) {
  const api = useDirectoryApi();
  const cache = useMemo<LookupCache>(() => {
    const names = new Map<string, Promise<Loaded>>();
    const links = new Map<string, Promise<OwnerSubject | null>>();
    const ownerSubject = (id: string) => {
      let promise = links.get(id);
      if (!promise) {
        promise = api.ownerSubjects.get(id).then(
          (result) => result.data,
          () => null,
        );
        links.set(id, promise);
      }
      return promise;
    };
    const load = async (kind: LookupKind, id: string): Promise<Loaded> => {
      switch (kind) {
        case 'agency':
          return { name: (await api.agencies.get(id)).data.displayName };
        case 'owner':
          return { name: (await api.owners.get(id)).data.displayName };
        case 'legalSubject':
          return { name: (await api.legalSubjects.get(id)).data.legalName };
        case 'signer':
          return { name: (await api.signers.get(id)).data.fullLegalName };
        case 'ownerSubject': {
          const link = await ownerSubject(id);
          if (link === null) return { failed: true };
          const [owner, subject] = await Promise.all([
            api.owners.get(link.ownerId),
            api.legalSubjects.get(link.legalSubjectId),
          ]);
          return { name: `${owner.data.displayName} · ${subject.data.legalName}` };
        }
      }
    };
    return {
      get(kind, id) {
        const key = `${kind}:${id}`;
        let promise = names.get(key);
        if (!promise) {
          promise = load(kind, id).catch((): Loaded => ({ failed: true }));
          names.set(key, promise);
        }
        return promise;
      },
      ownerSubject,
    };
  }, [api]);
  return <LookupContext.Provider value={cache}>{children}</LookupContext.Provider>;
}

export function useLookup(): LookupCache {
  const cache = useContext(LookupContext);
  if (!cache) throw new Error('useLookup must be used inside <LookupProvider>.');
  return cache;
}

const PATHS: Readonly<Record<LookupKind, string>> = {
  agency: '/directory/agencies',
  owner: '/directory/owners',
  legalSubject: '/directory/legal-subjects',
  signer: '/directory/signers',
  ownerSubject: '/directory/owner-subjects',
};

/** The name of a related record (a link to it unless `plain`). */
export function RecordName({
  kind,
  id,
  plain = false,
}: {
  kind: LookupKind;
  id: string;
  plain?: boolean;
}) {
  const lookup = useLookup();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let active = true;
    setLoaded(null);
    void lookup.get(kind, id).then((value) => {
      if (active) setLoaded(value);
    });
    return () => {
      active = false;
    };
  }, [lookup, kind, id]);
  const text =
    loaded === null ? 'Loading…' : 'name' in loaded ? loaded.name : 'Record not available';
  if (plain) return <span>{text}</span>;
  return <Link to={`${PATHS[kind]}/${id}`}>{text}</Link>;
}
