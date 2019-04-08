DEFINE VARIABLE ch_prog AS CHARACTER NO-UNDO.
DEFINE VARIABLE ch_mess AS CHARACTER NO-UNDO.
DEFINE VARIABLE i       AS INTEGER   NO-UNDO.

/* Extracts the parameters */
ASSIGN ch_prog = ENTRY( 1, SESSION:PARAMETER ).

RUN VALUE( REPLACE( PROGRAM-NAME( 1 ), "check-syntax.p", "read-env-var.p") ).

/* OpenEdge Startup Procedure */
DEFINE VARIABLE vsabl_oe_startup_procedure AS CHARACTER NO-UNDO.
vsabl_oe_startup_procedure = OS-GETENV ( "VSABL_OE_STARTUP_PROCEDURE" ).
IF LENGTH( vsabl_oe_startup_procedure ) > 0 THEN RUN VALUE( vsabl_oe_startup_procedure ).

/* Compile without saving */
COMPILE VALUE( ch_prog ) SAVE=NO NO-ERROR.

/* If there are compilation messages */
IF COMPILER:NUM-MESSAGES > 0 THEN DO:

  ASSIGN ch_mess = "".

  /* For each messages */
  DO i = 1 TO COMPILER:NUM-MESSAGES:

    /* Generate an error line */
    ASSIGN ch_mess =
      SUBSTITUTE( "&1 File:'&2' Row:&3 Col:&4 Error:&5 Message:&6",
        IF COMPILER:WARNING = TRUE THEN "WARNING" ELSE "ERROR",
        COMPILER:GET-FILE-NAME  ( i ),
        COMPILER:GET-ROW        ( i ),
        COMPILER:GET-COLUMN     ( i ),
        COMPILER:GET-NUMBER     ( i ),
        COMPILER:GET-MESSAGE    ( i )
      )
    .

    /* display the message to the standard output */
    PUT UNFORMATTED ch_mess SKIP.
  END.
END.
ELSE DO :
  /* display to the standard output */
  PUT UNFORMATTED "SUCCESS: Syntax is Correct." SKIP.
END.

/* End of program */
QUIT.