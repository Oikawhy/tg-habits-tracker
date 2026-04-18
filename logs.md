ERROR:    Exception in ASGI application

  + Exception Group Traceback (most recent call last):

  |   File "/usr/local/lib/python3.12/site-packages/starlette/_utils.py", line 77, in collapse_excgroups

  |     yield

  |   File "/usr/local/lib/python3.12/site-packages/starlette/middleware/base.py", line 186, in __call__

  |     async with anyio.create_task_group() as task_group:

  |                ^^^^^^^^^^^^^^^^^^^^^^^^^

  |   File "/usr/local/lib/python3.12/site-packages/anyio/_backends/_asyncio.py", line 799, in __aexit__

  |     raise BaseExceptionGroup(

  | ExceptionGroup: unhandled errors in a TaskGroup (1 sub-exception)

  +-+---------------- 1 ----------------

    | Traceback (most recent call last):

    |   File "/usr/local/lib/python3.12/site-packages/uvicorn/protocols/http/httptools_impl.py", line 399, in run_asgi

    |     result = await app(  # type: ignore[func-returns-value]

    |              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

    |   File "/usr/local/lib/python3.12/site-packages/uvicorn/middleware/proxy_headers.py", line 70, in __call__

    |     return await self.app(scope, receive, send)

    |            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    |     await self.middleware_stack(scope, receive, send)

    |   File "/usr/local/lib/python3.12/site-packages/starlette/middleware/errors.py", line 187, in __call__

    |     raise exc

    |   File "/usr/local/lib/python3.12/site-packages/starlette/middleware/errors.py", line 165, in __call__

    |     await self.app(scope, receive, _send)

    |   File "/usr/local/lib/python3.12/site-packages/starlette/middleware/cors.py", line 93, in __call__

    |     await self.simple_response(scope, receive, send, request_headers=headers)

    |   File "/usr/local/lib/python3.12/site-packages/starlette/middleware/cors.py", line 144, in simple_response

    |     await self.app(scope, receive, send)

    |   File "/usr/local/lib/python3.12/site-packages/starlette/middleware/base.py", line 185, in __call__

    |     with collapse_excgroups():

    |          ^^^^^^^^^^^^^^^^^^^^

    |   File "/usr/local/lib/python3.12/contextlib.py", line 158, in __exit__

    |     self.gen.throw(value)

    |   File "/usr/local/lib/python3.12/site-packages/starlette/_utils.py", line 83, in collapse_excgroups

    |     raise exc

    |   File "/usr/local/lib/python3.12/site-packages/starlette/middleware/base.py", line 187, in __call__

    |     response = await self.dispatch_func(request, call_next)

    |                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/local/lib/python3.12/site-packages/starlette/routing.py", line 715, in __call__

    await self.middleware_stack(scope, receive, send)

  File "/usr/local/lib/python3.12/site-packages/starlette/routing.py", line 735, in app

    await route.handle(scope, receive, send)

  File "/usr/local/lib/python3.12/site-packages/starlette/routing.py", line 288, in handle

    await self.app(scope, receive, send)

  File "/usr/local/lib/python3.12/site-packages/starlette/routing.py", line 76, in app

    await wrap_app_handling_exceptions(app, request)(scope, receive, send)

  File "/usr/local/lib/python3.12/site-packages/starlette/_exception_handler.py", line 62, in wrapped_app

    raise exc

  File "/usr/local/lib/python3.12/site-packages/starlette/_exception_handler.py", line 51, in wrapped_app

    await app(scope, receive, sender)

  File "/usr/local/lib/python3.12/site-packages/starlette/routing.py", line 73, in app

    response = await f(request)

               ^^^^^^^^^^^^^^^^

  File "/usr/local/lib/python3.12/site-packages/fastapi/routing.py", line 301, in app

    raw_response = await run_endpoint_function(

                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  File "/usr/local/lib/python3.12/site-packages/fastapi/routing.py", line 212, in run_endpoint_function

    return await dependant.call(**values)

           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  File "/app/routers/entries.py", line 49, in update_entry

    entry = await entry_service.update_entry(session, user_id, entry_id, data.model_dump())

            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  File "/app/services/entry_service.py", line 156, in update_entry

    await _update_streak(session, user_id, entry.habit_id, entry.entry_date)

  File "/app/services/entry_service.py", line 256, in _update_streak

    status = entry_res.scalar_one_or_none()

             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ File "/usr/local/lib/python3.12/site-packages/sqlalchemy/engine/result.py", line 1487, in scalar_one_or_none

    return self._only_one_row(

           ^^^^^^^^^^^^^^^^^^^

  File "/usr/local/lib/python3.12/site-packages/sqlalchemy/engine/result.py", line 805, in _only_one_row

    raise exc.MultipleResultsFound(