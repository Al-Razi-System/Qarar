# Home Dashboard (v2)

`POST /rest/v1/rpc/get_my_home_v2` (`Content-Profile: api_v2`, no parameters) returns the signed-in person's home page
in one call. Every figure is computed for the caller in their organisation.

| Key | Content |
|---|---|
| `user` | `{name_ar}` |
| `meetings` | `{count, items}`: meetings of councils where the caller is an active member, live now or scheduled within 14 days; live first |
| `votes` | `{count, items}`: open voting rounds in those meetings where the caller has not voted |
| `signatures` | `{count, items}`: minute approvals pending for the caller |
| `tasks` | `{open, overdue, to_verify, items}`: tasks assigned to the caller (`new`/`in_progress`/`overdue`), and tasks submitted to the caller as follower |
| `topics` | `{returned, to_review, items}`: topics returned to their submitter, and `under_review` topics in councils the caller chairs or reports |
| `leadership` | `{councils, open}`: councils the caller leads and their open violations |
| `oversight` | `null` when the caller follows nothing; else `{councils, open, escalated, by_rule, oldest}` |
| `organization` | `null` unless the caller holds `governance.oversight.manage`; else organisation-wide counts |

Each card is computed by the module that owns its data (`qarar_meetings.home_meetings_v2`, `qarar_voting.home_votes_v2`,
`qarar_minutes.home_signatures_v2`, `qarar_execution.home_tasks_v2`, `qarar_topics.home_topics_v2`,
`qarar_governance.home_oversight_v2`, `qarar_governance.home_organization_v2`) and assembled by
`qarar_governance.get_my_home_v2`; the cross-module calls are registered in `module_function_execute_allowlist`.
