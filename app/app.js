document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("go").onclick = function () {
        var params = {
            "distro": document.getElementById("distro-select").value,
            "pkg": document.getElementById("pkg").value,
            "type": document.getElementById("type").value,
            "name": document.getElementById("name").value
        }
        location.href =
            "http://" + 
            window.location.host +
            window.location.pathname +
            "?" +
            param(params)
    }
})

function param(params) {
    let str = ""
    for (const name in params) {
        str += ("&" + name + "=" + params[name])
    }
    return str.slice(1)
}