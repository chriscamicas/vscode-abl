using Progress.Json.ObjectModel.*.

def input param nm-dir-par as char no-undo.

def var aJsonTable as JsonArray no-undo.
def var aJsonField as JsonArray no-undo.
def var aJsonIndex as JsonArray no-undo.

def var oTable as JsonObject no-undo.
def var oField as JsonObject no-undo.
def var oIndex as JsonObject no-undo.

def var isPK as logical no-undo.

aJsonTable = new JsonArray().

def buffer dbFile for dictdb._file.
def buffer dbField for dictdb._field.
def buffer dbIndex for dictdb._index.
def buffer dbIndexField for dictdb._index-field.

for each dbFile:

    oTable = new JsonObject().
    oTable:add("label", dbFile._file-name).
    oTable:add("kind", 5). /*Variable*/
    oTable:add("detail", dbFile._Desc).
    aJsonTable:add(oTable).

    aJsonField = new JsonArray().
    oTable:add("fields", aJsonField).

    for each dbField
       where dbField._file-recid = recid(dbFile):
        oField = new JsonObject().
        oField:add("label", dbField._field-name).
        oField:add("kind", 4). /*Field*/
        oField:add("detail", dbField._Desc).
        oField:add("dataType", dbField._data-type).
        oField:add("mandatory", dbField._mandatory).
        oField:add("format", dbField._format).
        aJsonField:add(oField).
    end.

    aJsonIndex = new JsonArray().
    oTable:add("indexes", aJsonIndex).

    for each dbIndex
        where dbIndex._file-recid = recid(dbFile):

            assign isPK = (recid(dbIndex) = dbFile._prime-index).

            oIndex = new JsonObject().
            oIndex:add("label", dbIndex._index-name).
            oIndex:add("kind", 14). /*Snippet*/
            oIndex:add("detail", dbIndex._Desc).
            oIndex:add("unique", dbIndex._unique).
            oIndex:add("primary", isPK).

            aJsonField = new JsonArray().
            for each dbIndexField
                where dbIndexField._index-recid = recid(dbIndex),
                first dbField
                where recid(dbField) = dbIndexField._field-recid:

                    oField = new JsonObject().
                    oField:add("label", dbField._field-name).
                    //oField:add("kind", 17). /*Reference*/
                    //oField:add("detail", dbField._Desc).
                    aJsonField:add(oField).
            end.
            oIndex:add("fields", aJsonField).
            aJsonIndex:add(oIndex).
    end.

end.

aJsonTable:writefile(nm-dir-par + ".openedge.db." + ldbname("dictdb")).
