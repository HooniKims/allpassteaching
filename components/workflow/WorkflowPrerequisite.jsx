export function WorkflowPrerequisite({ title, description, actionLabel, onAction }) {
    return <section className="workflow-prerequisite" aria-labelledby="workflow-prerequisite-title">
        <p className="eyebrow">선행 단계가 필요해요</p>
        <h1 id="workflow-prerequisite-title">{title}</h1>
        <p>{description}</p>
        <button type="button" onClick={onAction}>{actionLabel}</button>
    </section>;
}
