RUN VALUE( REPLACE( PROGRAM-NAME( 1 ), "dict-dump.p", "pre-launch.p") ).

/* directory */
def var nm-dir-aux as char no-undo.
assign nm-dir-aux = replace(OS-GETENV("VSABL_WORKSPACE"), "~\", "/").
if r-index(nm-dir-aux, "/") < length(nm-dir-aux)
then assign nm-dir-aux = nm-dir-aux + "/".

def var ix as int no-undo.
repeat ix = 1 to num-dbs:
    if (lookup(ldbname(ix), session:parameter) > 0)
    then do:
        create alias "DICTDB" for database value(ldbname(ix)).
        run VALUE(REPLACE(PROGRAM-NAME(1), "dict-dump.p", "dict-dump-exec.p")) (nm-dir-aux).
        delete alias "DICTDB".
    end.
end.

RUN VALUE( REPLACE( PROGRAM-NAME( 1 ), "dict-dump.p", "post-launch.p") ).
