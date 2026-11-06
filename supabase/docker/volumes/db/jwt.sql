\set jwt_secret `echo "$JWT_SECRET"`
\set jwt_exp `echo "$JWT_EXP"`

SELECT current_database() AS jwt_database \gset
ALTER DATABASE :"jwt_database" SET "app.settings.jwt_secret" TO :'jwt_secret';
ALTER DATABASE :"jwt_database" SET "app.settings.jwt_exp" TO :'jwt_exp';
