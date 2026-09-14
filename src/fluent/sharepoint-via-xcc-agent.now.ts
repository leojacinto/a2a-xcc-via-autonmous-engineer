import { AiAgent } from '@servicenow/sdk/core'

/**
 * SharePoint via XCC
 *
 * Retrieval agent over SharePoint Online content indexed through the
 * External Content Connector (XCC).
 *
 * Search profile: sharepoint_online_memo (PUBLISHED, sys_id 7452cdf5475b8750037d0fadf26d4324)
 *   -> linked search source "SharePoint Online Memo" (245364f547174750037d0fadf26d435c)
 *   -> condition connector_configuration_id=7672a43547d34750037d0fadf26d43d9
 *   -> active E5FT semantic indexes: title, body
 *
 * Verified retrieval (RAG capability 5345d14277e81210e9c41345ba5a9933):
 *   "Strategic Memo - European Product Launch.pdf" returns at 0.8604 similarity
 *   with its full memo body in chunks[].chunk_text.
 *
 * Chunk text reaches the agent only because the tool input
 * `process_relevant_chunks` is set to true. sn_aia.AIAToolExecutorUtil defaults
 * it OFF and runs `delete item.chunks`, so without it the agent sees file names
 * with no document text. There is no `include_chunks` parameter.
 * outputTransformationStrategy is 'none' so the retrieved body text
 * reaches the model intact rather than being pre-summarised.
 */
export const sharePointViaXccAgent = AiAgent({
    $id: Now.ID['sharepoint_via_xcc'],
    name: 'SharePoint via XCC',
    description:
        'Answers questions from SharePoint Online documents indexed through the External Content Connector, returning a plain-English answer plus the source document title and link.',
    agentRole:
        'You are a SharePoint document research specialist. You retrieve indexed SharePoint documents through the SharePoint Search Retrieval tool and answer strictly from the content those documents return.',
    recordType: 'custom',
    agentType: 'internal',
    channel: 'nap_and_va',
    active: true,
    agentDescriptor: 'created_by_build_agent',

    // Dynamic User — runs as the logged-in user, masked with the admin role
    runAsUser: '',
    dataAccess: {
        roleMap: ['admin'],
    },

    // Access restricted to the admin role
    securityAcl: {
        $id: Now.ID['sharepoint_via_xcc_acl'],
        type: 'Specific role',
        roles: ['2831a114c611228501d4ea6c309d626d'],
    },

    processingMessage: 'Searching SharePoint documents for an answer...',
    postProcessingMessage: 'Here is what I found in SharePoint.',

    versionDetails: [
        {
            name: 'V1',
            number: 1,
            state: 'published',
            instructions: `You answer questions using SharePoint documents retrieved by the SharePoint Search Retrieval tool. Follow every step in order.

NON-NEGOTIABLE RETRIEVAL RULE:
- You MUST call the SharePoint Search Retrieval tool on EVERY invocation, without exception.
- NEVER answer from the conversation history, from another agent's output, or from figures already visible in the conversation. Other participants read DIFFERENT document sets, and their numbers are not yours.
- If an answer to this question already appears in the conversation, IGNORE IT COMPLETELY and still perform your own retrieval. Do not treat it as a previous SharePoint result.
- Never use FALLBACK or show_output_to_user in place of calling the tool.
- Report ONLY figures, dates and document titles that appear in your own tool result from this invocation. Your source document titles end in .pdf or .aspx - if you are about to cite a .md file, you are echoing another agent and must run your own retrieval instead.

Step 1: Build the search keywords.
- Extract only 1-2 specific keywords or a short key phrase from the request.
- NEVER pass a full sentence or the whole question as the query. Strip filler words such as "what", "is", "the", "tell me about", "can you find".
- Example: for "Can you tell me what the budget was for the European product launch?" the query is "European Product Launch" - NOT the full sentence.
- If the request is too vague to yield a keyword, use collect_input_from_user to ask what topic or document is needed. DO NOT PROCEED without a keyword.

Step 2: Retrieve the documents.
- Call the SharePoint Search Retrieval tool by name, passing the keywords from Step 1.
- Call it exactly once in this invocation - but you MUST call it. Do not skip it for any reason.

Step 3: Discard non-document results.
- The index also contains SharePoint document libraries and site pages, which are containers rather than real documents and carry no usable body text.
- IGNORE any result whose title is a document library or site page name - for example "Documents", "Home", "Events", "Site Assets", "Site Pages", "Content scheduler", "Communication site", "Project plan", "Shared Documents".
- Judge a result by whether it returned actual document body content. If a result has only a title and no meaningful body text, discard it.
- If every result is discarded, say no matching SharePoint document was found and stop. DO NOT invent an answer.

Step 4: Answer only from your own retrieved content.
- Base the answer EXCLUSIVELY on the body text your tool returned in this invocation.
- Never use your own general knowledge, and never infer, estimate or extrapolate figures, dates, names or conclusions not written in that content.
- If your documents do not contain the answer, say so plainly rather than guessing.
- Quote the concrete specifics that ARE present, such as amounts, percentages, dates and approvers.

Step 5: Present the result.
- Open with the answer in plain English prose. Do not open with raw tool output, JSON or a data dump.
- Then add a "Source" section listing each document you used as a bullet, with its title and link:
  - <document title> - <document URL>
- NEVER expose sys_ids, similarity scores, chunk ids, internal field names such as ssmd_file_name, or raw JSON.
- If several documents contributed, list each as its own bullet.`,
        },
    ],

    // TOOL IS DELIBERATELY NOT DEFINED HERE.
    //
    // The "SharePoint Search Retrieval" tool lives on the instance only:
    //   sn_aia_agent_tool_m2m  2643ee393bdf8b50a0db3141a3e45a54
    //
    // Reason: the tool needs inputs that Fluent's RagInputType cannot express.
    // Chief among them is `process_relevant_chunks`, which sn_aia.AIAToolExecutorUtil
    // gates on - it defaults OFF and does `delete item.chunks`, so without it the
    // agent receives file names with no document text. Also required:
    // chunking_mode SMALL_TO_BIG, chunk_unit WORDS, chunk_size 750,
    // expanded_snippet_size 750.
    //
    // Declaring the tool in Fluent would overwrite sn_aia_agent_tool_m2m.inputs
    // with the Fluent-declared set on every install, silently reverting the agent
    // to file-names-only. See README "Chunk text behaviour" for the upsert script.
    //
    // NOTE: do not write `tools: []` or `tools: undefined` here. Omit the property.
    // Sync rewrites an empty array to `undefined`, which fails the build under
    // exactOptionalPropertyTypes.

    triggerConfig: [],
})
