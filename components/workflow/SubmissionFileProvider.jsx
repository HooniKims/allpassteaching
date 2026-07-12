'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const SubmissionFileContext = createContext(null);

function revoke(entry) {
    if (entry?.packetUrl) URL.revokeObjectURL(entry.packetUrl);
}

export function SubmissionFileProvider({ children }) {
    const entries = useRef(new Map());
    const [revision, setRevision] = useState(0);
    const get = useCallback(id => entries.current.get(id), []);
    const has = useCallback(id => entries.current.has(id), []);
    const setMany = useCallback(items => {
        const prepared = [];
        try {
            for (const item of items) prepared.push({ ...item, packetUrl: URL.createObjectURL(item.packetFile) });
        } catch (error) {
            for (const item of prepared) revoke(item);
            throw error;
        }
        for (const item of prepared) {
            revoke(entries.current.get(item.id));
            entries.current.set(item.id, item);
        }
        setRevision(value => value + 1);
    }, []);
    const set = useCallback((id, files) => setMany([{ id, ...files }]), [setMany]);
    const remove = useCallback(id => {
        const current = entries.current.get(id);
        if (!current) return;
        revoke(current);
        entries.current.delete(id);
        setRevision(value => value + 1);
    }, []);
    const removeMany = useCallback(ids => {
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
        if (!entries.current.size) return;
        for (const entry of entries.current.values()) revoke(entry);
        entries.current.clear();
        setRevision(value => value + 1);
    }, []);
    useEffect(() => () => {
        for (const entry of entries.current.values()) revoke(entry);
        entries.current.clear();
    }, []);
    const value = useMemo(() => ({ clear, get, has, remove, removeMany, revision, set, setMany }), [clear, get, has, remove, removeMany, revision, set, setMany]);
    return <SubmissionFileContext.Provider value={value}>{children}</SubmissionFileContext.Provider>;
}

export function useSubmissionFiles() {
    const value = useContext(SubmissionFileContext);
    if (!value) throw new Error('SubmissionFileProvider 안에서 사용해야 합니다.');
    return value;
}
