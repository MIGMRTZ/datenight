"""CLI commands for managing couples."""

import uuid
from typing import Any

import typer
from rich.panel import Panel

from datenight.api_client import get_client
from datenight.commands._common import console, handle_api_errors, prompt_selection

couple_app = typer.Typer(name="couple", help="Manage couples.")


def _select_couple(couples: list[dict[str, Any]]) -> dict[str, Any]:
    """If one couple, return it. If multiple, prompt user to pick."""
    if len(couples) == 1:
        return couples[0]
    typer.echo("Multiple couples found:")
    for i, c in enumerate(couples, 1):
        typer.echo(f"  {i}. {c['id']}")
    idx = prompt_selection(couples, "couple")
    return couples[idx]


@couple_app.command("create")
@handle_api_errors
def create() -> None:
    """Link two profiles as a couple."""
    client = get_client()
    profiles = client.list_profiles()

    if len(profiles) < 2:
        typer.echo(
            "Need at least 2 profiles to create a couple. Run `datenight profile create` first."
        )
        raise typer.Exit(1)

    typer.echo("Available profiles:")
    for i, p in enumerate(profiles, 1):
        typer.echo(f"  {i}. {p['name']} ({p['id'][:8]}...)")

    a = prompt_selection(profiles, "partner A")
    b = prompt_selection(profiles, "partner B")

    if a == b:
        typer.echo("Cannot couple a partner with themselves. Select two different profiles.")
        raise typer.Exit(1)

    if not typer.confirm("Create this couple?", default=True):
        raise typer.Abort()

    client.create_couple(
        {
            "id": str(uuid.uuid4()),
            "partner_a": profiles[a]["id"],
            "partner_b": profiles[b]["id"],
        }
    )
    console.print(f"\n[green]Couple created![/green] {profiles[a]['name']} & {profiles[b]['name']}")


@couple_app.command("show")
@handle_api_errors
def show() -> None:
    """Display the current couple and both profiles."""
    client = get_client()
    couples = client.list_couples()

    if not couples:
        typer.echo("No couples found. Run `datenight couple create` to link two profiles.")
        return

    selected = _select_couple(couples)
    couple = client.get_couple(selected["id"])

    pa = couple["partner_a"]
    pb = couple["partner_b"]

    console.print(
        Panel(
            f"[bold]{pa['name']}[/bold]\n"
            f"Cuisines: {', '.join(pa.get('cuisines', []))}\n"
            f"Activities: {', '.join(pa.get('activities', []))}",
            title="Partner A",
        )
    )
    console.print(
        Panel(
            f"[bold]{pb['name']}[/bold]\n"
            f"Cuisines: {', '.join(pb.get('cuisines', []))}\n"
            f"Activities: {', '.join(pb.get('activities', []))}",
            title="Partner B",
        )
    )


@couple_app.command("unlink")
@handle_api_errors
def unlink() -> None:
    """Remove the couple link (profiles are preserved)."""
    client = get_client()
    couples = client.list_couples()

    if not couples:
        typer.echo("No couples found.")
        return

    selected = _select_couple(couples)
    couple = client.get_couple(selected["id"])
    pa_name = couple["partner_a"]["name"]
    pb_name = couple["partner_b"]["name"]

    if not typer.confirm(f"Unlink {pa_name} & {pb_name}?"):
        raise typer.Abort()

    client.delete_couple(selected["id"])
    typer.echo(f"Unlinked {pa_name} & {pb_name}. Profiles preserved.")
