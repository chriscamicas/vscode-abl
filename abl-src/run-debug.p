DEFINE VARIABLE ch_prog AS CHARACTER NO-UNDO.

/* Extracts the parameters */

ASSIGN ch_prog = OS-GETENV ( "VSABL_STARTUP_PROGRAM" ).
if ch_prog = "" then
do:
    ASSIGN ch_prog = ENTRY( 1, SESSION:PARAMETER ).
end.

RUN VALUE( REPLACE( PROGRAM-NAME( 1 ), "run-debug.p", "read-env-var.p") ).

/* OpenEdge Startup Procedure */
DEFINE VARIABLE vsabl_oe_startup_procedure AS CHARACTER NO-UNDO.
vsabl_oe_startup_procedure = OS-GETENV ( "VSABL_OE_STARTUP_PROCEDURE" ).
IF LENGTH( vsabl_oe_startup_procedure ) > 0 THEN RUN VALUE( vsabl_oe_startup_procedure ).

/* We have to wait for the debugger to connect to this process and set up breakpoints
When ready, the host sends a key input
READKEY is the easiest way I found to pause and wait for a signal from the host */
READKEY.
RUN VALUE( ch_prog ).
