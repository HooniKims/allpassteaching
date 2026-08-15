import { useEffect, useState } from 'react';
import { emptyToolEvidence } from '@/lib/lesson-input';
import { useOperation } from '@/components/workflow/OperationProvider.jsx';

const SEARCH_DEBOUNCE_MS = 700;
const SOURCE_LABELS = {
    tavily: '검색으로 확인한 도구입니다.',
    duckduckgo: '웹 검색으로 확인한 도구입니다.',
};

export function TeachingToolsField({ value, onChange }) {
    const { runOperation } = useOperation();
    const [searching, setSearching] = useState(false);
    const [recommendations, setRecommendations] = useState([]);
    const [recommendStatus, setRecommendStatus] = useState('idle');
    const [recommendMessage, setRecommendMessage] = useState('');
    const tools = value.teachingTools ?? '';
    const evidence = value.toolEvidence ?? emptyToolEvidence;
    const query = tools.trim();

    useEffect(() => {
        if (!query) {
            setSearching(false);
            if (evidence.query) onChange(current => ({ ...current, toolEvidence: { ...emptyToolEvidence } }));
            return;
        }
        // 이미 같은 문구로 확인해 둔 근거가 있으면 다시 검색하지 않습니다.
        if (evidence.query === query) { setSearching(false); return; }
        const controller = new AbortController();
        setSearching(true);
        const timer = setTimeout(async () => {
            let tool = { ...emptyToolEvidence, query };
            try {
                const response = await fetch('/api/search-tool', {
                    method: 'POST', signal: controller.signal,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query }),
                });
                const body = await response.json();
                if (response.ok && body.tool) tool = { query, source: body.tool.source, verified: body.tool.verified, summary: body.tool.summary };
            } catch {
                // 검색이 막혀도 미검증 상태로 두고 지도안 작성은 계속할 수 있게 합니다.
            }
            if (controller.signal.aborted) return;
            setSearching(false);
            onChange(current => ({ ...current, toolEvidence: tool }));
        }, SEARCH_DEBOUNCE_MS);
        return () => { clearTimeout(timer); controller.abort(); };
        // onChange는 렌더마다 새로 만들어지므로 의존성에서 제외합니다. 갱신은 항상 함수형으로 보내 최신 상태를 씁니다.
    }, [query, evidence.query]);

    const recommendTools = async () => {
        setRecommendStatus('loading');
        setRecommendMessage('');
        try {
            const result = await runOperation({ kind: 'tool-recommendation', label: '수업 도구 추천', phase: 'upstageWaiting', cancelable: true, model: 'configured-generation-model' }, async ({ signal }) => {
                const response = await fetch('/api/recommend-tools', {
                    method: 'POST', signal,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lessonIntent: value.intent, schoolLevel: value.schoolLevel, grade: value.grade, subject: value.displaySubject || value.subject }),
                });
                return { body: await response.json(), ok: response.ok };
            });
            if (!result) { setRecommendStatus('idle'); return; }
            if (!result.ok) {
                setRecommendStatus('error');
                setRecommendMessage(result.body?.message || '도구를 추천하지 못했습니다. 다시 시도해주세요.');
                return;
            }
            setRecommendations(result.body.tools ?? []);
            setRecommendStatus('done');
        } catch {
            setRecommendStatus('error');
            setRecommendMessage('도구를 추천하지 못했습니다. 다시 시도해주세요.');
        }
    };

    const addRecommendedTool = name => {
        const current = tools.trim();
        if (current.includes(name)) return;
        onChange(next => ({ ...next, teachingTools: current ? `${current}, ${name}` : name, error: '' }));
    };

    return <section className="teaching-tools" aria-label="수업 때 사용할 도구">
        <label>수업 때 사용할 도구 및 추가 사항 <span className="optional">선택</span>
            <textarea aria-label="수업 때 사용할 도구 및 추가 사항" rows="3" value={tools} onChange={event => onChange({ ...value, teachingTools: event.target.value, error: '' })} placeholder="예: 스노클(Snorkl)로 학생이 말로 설명한 내용을 녹화해요"/>
            <small>수업에서 쓸 AI·에듀테크 도구나 준비물을 적어주세요. 적으면 그 도구를 검색해 실제 기능을 확인한 뒤 지도안과 학습지에 반영합니다.</small>
        </label>
        <p className="teaching-tools__status" role="status">
            {searching ? <span className="review-badge">도구를 검색하는 중…</span>
                : !query ? null
                    : evidence.verified ? <span className="review-badge">{SOURCE_LABELS[evidence.source] ?? '검색으로 확인한 도구입니다.'}</span>
                        : <span className="review-badge review-badge--warning">미검증 도구 · 검색으로 확인하지 못했습니다. 기능을 직접 확인해주세요.</span>}
        </p>
        <div className="teaching-tools__action">
            <button type="button" className="secondary-button" disabled={!value.intent?.trim() || !value.schoolLevel || recommendStatus === 'loading'} onClick={recommendTools}>
                {recommendStatus === 'loading' ? '찾는 중…' : '수업 내용에 맞는 도구 추천받기'}
            </button>
        </div>
        {recommendMessage && <p className="form-alert" role="alert">{recommendMessage}</p>}
        {recommendStatus === 'done' && !recommendations.length && <p className="recommendation-note">추천할 도구를 찾지 못했습니다. 사용할 도구를 직접 적어주세요.</p>}
        {!!recommendations.length && <>
            <p className="recommendation-note">입력한 수업 내용에 맞는 도구입니다. 검색으로 확인한 내용을 보고 직접 선택해주세요.</p>
            <ul className="teaching-tools__list">{recommendations.map(item => <li key={item.name}>
                <span>
                    <strong>{item.name}</strong>
                    {!item.search?.verified && <span className="review-badge review-badge--warning">미검증</span>}
                    <small>{item.reason}</small>
                    {item.search?.results?.[0]?.url && <small><a href={item.search.results[0].url} target="_blank" rel="noreferrer noopener">{item.search.results[0].url}</a></small>}
                </span>
                <button type="button" className="secondary-button" onClick={() => addRecommendedTool(item.name)}>담기</button>
            </li>)}</ul>
        </>}
    </section>;
}
