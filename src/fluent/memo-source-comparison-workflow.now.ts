import { AiAgenticWorkflow } from '@servicenow/sdk/core'

/**
 * Memo Source Comparison
 *
 * Asks the same question of two independent memo sources and reports both
 * answers side by side, flagging any factual disagreement. Neither source is
 * treated as authoritative.
 *
 * Team members (deployed agent sys_ids - names/Now.ID are not valid here):
 *   SharePoint via XCC      a44df5ca63a24e3785d713ddbdbb7254  (internal, AI Search / XCC)
 *   Memo Agent (External)   39dd3a713b930f50a0db3141a3e45a23  (external, A2A protocol)
 *
 * The external agent is registered manually on the instance - provider,
 * discovery, card, configuration, alias and connection have no Fluent API and
 * are Global-scoped. It is referenced here by sys_id only. Do NOT author it as
 * an AiAgent in Fluent: versionDetails coalesces on target_id + version_name
 * and would overwrite the published-version and applicability fixes that make
 * it dispatch. See README "Manual steps - external A2A agent".
 *
 * The two sources are known to disagree on at least one figure - the total
 * authorized spend for the European Product Launch. Surfacing that split,
 * rather than silently picking a winner, is the whole point of this workflow.
 *
 * executionMode is 'autopilot': both steps are read-only retrieval, so there
 * is nothing to confirm before acting.
 */
export const memoSourceComparisonWorkflow = AiAgenticWorkflow({
    $id: Now.ID['memo_source_comparison_workflow'],
    name: 'Memo Source Comparison',
    description:
        'Asks the same memo question of the SharePoint XCC index and the external A2A Memo Agent, then reports both answers side by side and flags any factual discrepancy without declaring either correct.',
    recordType: 'custom',
    active: true,
    executionMode: 'autopilot',
    memoryScope: 'global',

    runAs: '',
    dataAccess: {
        roleMap: ['admin'],
        description: 'Restrict memo comparison workflow data access to the admin role',
    },

    securityAcl: {
        $id: Now.ID['memo_source_comparison_workflow_acl'],
        type: 'Specific role',
        roles: ['2831a114c611228501d4ea6c309d626d'],
    },

    team: {
        $id: Now.ID['memo_source_comparison_team'],
        name: 'Memo Source Comparison Team',
        members: [
            'a44df5ca63a24e3785d713ddbdbb7254', // SharePoint via XCC
            '39dd3a713b930f50a0db3141a3e45a23', // Memo Agent (External) - manually registered A2A
        ],
    },

    versions: [
        {
            name: 'V1',
            number: 1,
            state: 'published',
            instructions: `You compare how two independent sources answer the same question about the strategic memos. Neither source outranks the other.

MANDATORY AGENT SEQUENCE - both agents MUST run, in this order:
  1. Memo Agent (External)   <- ALWAYS FIRST
  2. SharePoint via XCC      <- ALWAYS SECOND
You are FORBIDDEN from using Finish until BOTH agents have returned a response in this conversation. Answering after only one agent is a failed run. If you are about to Finish and only one agent has responded, call the missing agent instead.

Step 1: Establish the question.
- Take the user's question about the strategic memos from the task.
- Use the identical question for both agents. Do not reword it between them.
- If no clear question is present, ask the user what they want to compare. DO NOT PROCEED without a question.

Step 2: Call Memo Agent (External) FIRST.
- Call the agent named "Memo Agent (External)" with the question from Step 1.
- It is reached over the A2A protocol and answers from its own separate document set.
- Record its answer verbatim - every amount, percentage, date, approver and document name it returned. Call this record EXTERNAL_ANSWER.
- Do this BEFORE any SharePoint call, so no SharePoint figures exist in context yet.
- If it returns nothing or errors, set EXTERNAL_ANSWER = "unavailable". Then still continue to Step 3.

Step 3: Call SharePoint via XCC SECOND.
- Call the agent named "SharePoint via XCC" with the same question.
- Pass ONLY the question. Do NOT include, summarise or hint at EXTERNAL_ANSWER or any of its figures in what you send. This agent must perform its own independent retrieval.
- Record its answer verbatim. Call this record SHAREPOINT_ANSWER.
- Do NOT revise, correct or overwrite EXTERNAL_ANSWER based on anything in SHAREPOINT_ANSWER. EXTERNAL_ANSWER was captured first and is frozen.
- If SHAREPOINT_ANSWER repeats EXTERNAL_ANSWER's figures exactly AND cites the same document names, the agent echoed instead of retrieving. Call it again, instructing it to run its own SharePoint retrieval and ignore anything already in the conversation.
- If it returns nothing, set SHAREPOINT_ANSWER = "no answer".

Step 4: Compare the two frozen records.
- Compare EXTERNAL_ANSWER against SHAREPOINT_ANSWER fact by fact: amounts, percentages, dates, approvers, milestones.
- Report each source's own values. Never copy a value from one record into the other. Never substitute your own knowledge for a missing value - say "not stated by this source".
- Expect the two sources to hold different revisions of the same memos, so differing figures are a normal and valid outcome, not an error.
- Classify as:
  - DISAGREE - the records state different values for the same fact.
  - AGREE - the records independently state the same values.
  - PARTIAL - one record is "unavailable" or "no answer".

Step 5: Present the comparison.
- Open with a one-line verdict.
- Then "Side by side", one bullet per source, each showing only its own recorded values:
  - Memo Agent (external A2A): <EXTERNAL_ANSWER values> - source: <document names it gave>
  - SharePoint (ServiceNow index): <SHAREPOINT_ANSWER values> - source: <document names it gave>
- If DISAGREE, add a "Discrepancy" section listing each differing fact with both values.
- State that this workflow does not decide which source is correct, and a human should reconcile against the authoritative document.
- NEVER expose sys_ids, similarity scores, chunk ids, internal field names or raw JSON.`,
        },
    ],

    triggerConfig: [],
})
