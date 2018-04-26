$(document).ready(function() {
    // Initialise Elements
    M.AutoInit();

    // Hide Done Records
    $(".done").hide();
});

$(document).delegate("#mark", "click", function() {
    // Get ID
    var id = $(this).data("id");

    // Make POST Request
    $.post("/mark", {
        id: id
    }, function(resp) {
        if (resp.code === 200) {
            M.toast({
                html: "The record was marked.",
                classes: "rounded"
            });
            $("#" + id).slideUp();
        }
        else {
            M.toast({
                html: "An unknown error occurred.",
                classes: "rounded"
            });
        }
    });
});