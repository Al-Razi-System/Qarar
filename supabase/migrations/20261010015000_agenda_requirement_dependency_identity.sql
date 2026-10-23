begin;
update qarar_architecture.module_function_execute_allowlist set identity_arguments='p_topic_id uuid, p_phase text'
where source_module='meetings' and target_schema='qarar_topics' and function_name='assert_topic_requirements_ready' and identity_arguments='p_topic_id uuid, p_timing text';
commit;
