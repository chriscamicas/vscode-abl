DEFINE VARIABLE vsabl_proPath AS CHARACTER NO-UNDO.
vsabl_proPath = OS-GETENV ( "VSABL_PROPATH" ).

DEFINE VARIABLE vsabl_proPathMode AS CHARACTER NO-UNDO.
vsabl_proPathMode = OS-GETENV ( "VSABL_PROPATH_MODE" ).

IF LENGTH( vsabl_proPath ) > 0 THEN DO:
    CASE vsabl_proPathMode :
        WHEN "append" THEN DO :
            ASSIGN PROPATH = PROPATH + "," + vsabl_proPath.
        END.
        WHEN "prepend" THEN DO :
            ASSIGN PROPATH = vsabl_proPath + "," + PROPATH.
        END.
        WHEN "overwrite" THEN DO :
            ASSIGN PROPATH = vsabl_proPath.
        END.
    END.
END.
