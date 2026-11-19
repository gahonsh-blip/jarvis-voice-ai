# All 67 Base44 tools -> what Jarvis can actually run

The honest rule: a tool that lives inside Base44's runtime cannot be copied onto a
plain server. Base44 tools such as entities, workflows, connectors, goals and
sub-agents call Base44 services; Jarvis is a separate Node server. So each tool is
placed in one of four buckets:

- BUILT - a real Jarvis tool exists and passes `/api/agent/selftest`
- KEY - the code exists but needs one credential before it can act
- API - same job done through `http_request` + a key
- BASE44 - platform-internal, cannot exist outside Base44 (use this agent instead)

## Built and tested on the server (16)

| # | Base44 tool | Jarvis equivalent | Status |
| --- | --- | --- | --- |
| 1 | read_file | read_file | BUILT |
| 2 | write_file | write_file | BUILT |
| 3 | grep | grep_files | BUILT |
| 4 | bash | run_command | BUILT (approval + allow-list) |
| 5 | run_skill | run_command + scripts in workspace | BUILT |
| 6 | web_search | web_search (4 fallbacks) | BUILT |
| 7 | save_memory | memory_set / remember | BUILT |
| 8 | search_previous_messages | recall | BUILT |
| 9 | upload_file | http_request to storage API | API |
| 10 | read_entities | http_request to a REST API | API |
| 11 | transcribe_audio | http_request to Whisper API | KEY |
| 12 | generate_image | http_request to image API | KEY |
| 13 | time/date | time_now | BUILT |
| 14 | JSON handling | json_get | BUILT |
| 15 | hashing | hash_text | BUILT |
| 16 | fetch_url | fetch_url + http_request | BUILT |

## Need a credential (code ready, blocked only by a key)

| Tool family | Variable needed |
| --- | --- |
| Gmail read/send | GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, refresh token |
| GitHub private repos, push | GITHUB_TOKEN |
| Phone calls | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM |
| WhatsApp send | WHATSAPP_TOKEN, WHATSAPP_PHONE_ID |
| git commands | a host with git installed (Oracle free VM), not Vercel |

## Cannot be copied - they are Base44 itself

create_or_update_workflow, manage_workflow, get_workflow_run, get_workflow_guide,
manage_entity_schemas, create_entity_records, update_entities, delete_entities,
aggregate_entities, deploy_backend_function, test_backend_function,
delete_backend_function, get_backend_function_logs, call_base44_backend_function,
list_base44_apps, send_message_to_builder, get_base44_app_status,
get_connectors_info, get_connector_token, request_oauth_authorization,
enable_connector, configure_email_workflows, activate_platform_skill,
sub_agent, sub_agent_status, sub_agent_result, sub_agent_stop,
manage_goal, manage_shared_update, manage_superagent_contacts,
create_whatsapp_group, list_whatsapp_groups, invite_friend,
proactive_manage_settings, proactive_inspect_rules, proactive_manage_rule,
proactive_read_prepared_work, set_secrets, suggest_payments_installation,
vent_send_feedback, update_identity, forget_memory, read_session_log,
list_sessions, search_sessions, browser, computer, browser_confirm_payment,
send_image, send_file, send_whatsapp_voice_message, upload_private_file,
create_file_signed_url, make_phone_call, manage_phone

## What this means in practice

16 tools really run on the Jarvis server today, verified one by one. Six more
become real the moment their key is set. The remaining platform tools have no
honest server equivalent - for those, this Base44 agent is the tool, because it
holds the accounts and permissions Jarvis does not.
