USING OpenEdge.ABLUnit.Runner.ABLRunner.
USING OpenEdge.ABLUnit.Runner.TestConfig.
USING OpenEdge.ABLUnit.Model.TestEntity.
USING OpenEdge.ABLUnit.Results.TestTypeResult.

USING Progress.Json.ObjectModel.JsonArray.
USING Progress.Json.ObjectModel.JsonObject.
USING Progress.Json.ObjectModel.ObjectModelParser.
USING Progress.Lang.AppError.
USING Progress.Lang.Error.

ROUTINE-LEVEL ON ERROR UNDO, THROW.

DEFINE var testFiles AS CHAR NO-UNDO.
/* testFiles = "C:/Users/christophe_c/Documents/Dev/ablunit-samples/tests/iban.test.p". */

DEFINE VARIABLE ablRunner AS ABLRunner NO-UNDO.
ablRunner = NEW ABLRunner().

DEFINE VARIABLE testIndex AS INTEGER NO-UNDO.
DEFINE VARIABLE caseIndex AS INTEGER NO-UNDO.

DEFINE VARIABLE testSummary AS TestTypeResult NO-UNDO.
DEFINE VARIABLE testEntity AS TestEntity NO-UNDO.

def var outputLog as char no-undo.

DEFINE VARIABLE prevStackTraceProperty AS LOGICAL NO-UNDO.
DEFINE  VARIABLE oldWarningsList AS CHARACTER NO-UNDO.

DEFINE VARIABLE testResource AS CHARACTER NO-UNDO.

prevStackTraceProperty = SESSION:ERROR-STACK-TRACE.
oldWarningsList = SESSION:SUPPRESS-WARNINGS-LIST.

SESSION:SUPPRESS-WARNINGS-LIST = '6430,' + SESSION:SUPPRESS-WARNINGS-LIST.
SESSION:ERROR-STACK-TRACE = TRUE.

DO ON ERROR UNDO, LEAVE:
    DO testIndex = 1 TO NUM-ENTRIES(testFiles):
        testResource = ENTRY(testIndex, testFiles).
        testEntity = ablRunner:populateTestModel(testResource, 1).
        ablRunner:updateFile(outputLog, "TEST_TREE" + " "  +  ablRunner:loadSerializedTree(testEntity), FALSE).
    END.
    IF testEntity NE ? THEN DO:
        testSummary = ablRunner:runtests(testEntity, outputLog).
        /* WriteTestResults(ablResultsFile, testEntity, testSummary). */
    END.

    FINALLY:
        /* COMPLETE event has to be updated anyway to complete the session. */
        ablRunner:updateFile(outputLog, "COMPLETE", FALSE).
        SESSION:ERROR-STACK-TRACE = prevStackTraceProperty.
        SESSION:SUPPRESS-WARNINGS-LIST = oldWarningsList.
    END.
END.
