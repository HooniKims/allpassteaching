'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const SubmissionFileContext = createContext(null);

function revoke(entry) {
    if (entry?.packetUrl) URL.revokeObjectURL(entry.packetUrl);
}

export function SubmissionFileProvider({ children }) {
    const entries = useRef(new Map());
    const lifecycle = useRef({ disposed: false, generation: 0 });
    const [revision, setRevision] = useState(0);
    const beginGeneration = useCallback(() => {
        if (lifecycle.current.disposed) return null;
        lifecycle.current.generation += 1;
        return lifecycle.current.generation;
    }, []);
    const generationIsCurrent = useCallback(token => !lifecycle.current.disposed && (token == null || token === lifecycle.current.generation), []);
    const get = useCallback(id => entries.current.get(id), []);
    const has = useCallback(id => entries.current.has(id), []);
    const setMany = useCallback((items, generationToken = null) => {
        if (!generationIsCurrent(generationToken)) return false;
        const prepared = [];
        try {
            for (const item of items) {
                if (!generationIsCurrent(generationToken)) {
                    for (const preparedItem of prepared) revoke(preparedItem);
                    return false;
                }
                prepared.push({ ...item, packetUrl: URL.createObjectURL(item.packetFile) });
            }
        } catch (error) {
            for (const item of prepared) revoke(item);
            throw error;
        }
        if (!generationIsCurrent(generationToken)) {
            for (const item of prepared) revoke(item);
            return false;
        }
        for (const item of prepared) {
            revoke(entries.current.get(item.id));
            entries.current.set(item.id, item);
        }
        setRevision(value => value + 1);
        return true;
    }, [generationIsCurrent]);
    const set = useCallback((id, files, generationToken = null) => setMany([{ id, ...files }], generationToken), [setMany]);
    const remove = useCallback(id => {
        if (lifecycle.current.disposed) return;
        lifecycle.current.generation += 1;
        const current = entries.current.get(id);
        if (!current) return;
        revoke(current);
        entries.current.delete(id);
        setRevision(value => value + 1);
    }, []);
    const removeMany = useCallback(ids => {
        if (lifecycle.current.disposed) return;
        lifecycle.current.generation += 1;
        let changed = false;
        for (const id of ids) {
            const current = entries.current.get(id);
            if (!current) continue;
            revoke(current);
            entries.current.delete(id);
            changed = true;
        }
        if (changed) setRevision(value => value + 1);
    }, []);
    const clear = useCallback(() => {
        if (lifecycle.current.disposed) return;
        lifecycle.current.generation += 1;
        if (!entries.current.size) return;
        for (const entry of entries.current.values()) revoke(entry);
        entries.current.clear();
        setRevision(value => value + 1);
    }, []);
    useEffect(() => {
        lifecycle.current.disposed = false;
        return () => {
            lifecycle.current.disposed = true;
            lifecycle.current.generation += 1;
            for (const entry of entries.current.values()) revoke(entry);
            entries.current.clear();
        };
    }, []);
    const value = useMemo(() => ({ beginGeneration, clear, get, has, remove, removeMany, revision, set, setMany }), [beginGeneration, clear, get, has, remove, removeMany, revision, set, setMany]);
    return <SubmissionFileContext.Provider value={value}>{children}</SubmissionFileContext.Provider>;
}

export function useSubmissionFiles() {
    const value = useContext(SubmissionFileContext);
    if (!value) throw new Error('SubmissionFileProvider 안에서 사용해야 합니다.');
    return value;
}
