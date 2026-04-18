
    value = await result

            ^^^^^^^^^^^^

  File "/usr/local/lib/python3.12/site-packages/sqlalchemy/dialects/postgresql/asyncpg.py", line 550, in _prepare_and_execute

    self._handle_exception(error)

  File "/usr/local/lib/python3.12/site-packages/sqlalchemy/dialects/postgresql/asyncpg.py", line 501, in _handle_exception

    self._adapt_connection._handle_exception(error)

  File "/usr/local/lib/python3.12/site-packages/sqlalchemy/dialects/postgresql/asyncpg.py", line 784, in _handle_exception

    raise translated_error from error

sqlalchemy.exc.DBAPIError: (sqlalchemy.dialects.postgresql.asyncpg.Error) <class 'asyncpg.exceptions.InFailedSQLTransactionError'>: current transaction is aborted, commands ignored until end of transaction block

[SQL: ALTER TABLE week_plans ADD CONSTRAINT uq_weekplan_user_habit_week_day_slot UNIQUE (user_id, habit_id, week_key, day_of_week, time_slot)]

(Background on this error at: https://sqlalche.me/e/20/dbapi)

[entrypoint] WARNING: Alembic migration failed, continuing with existing schema

[entrypoint] Starting uvicorn...

INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)

INFO:     Started parent process [1]