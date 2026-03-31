"""CLI commands for managing couples."""

import uuid
from typing import Any

import typer
from rich.console import Console
from rich.panel import Panel

from datenight.api_client import ApiError, get_client

couple_app = typer.Typer(name="couple", help="Manage couples.")
console = Console()


def _select_couple(couples: list[dict[str, Any]]) -> dict[str, Any]:
    """If one couple, return it. If multiple, prompt user to pick."""
    if len(couples) == 1:
        return couples[0]
    typer.echo("Multiple couples found:")
    for i, c in enumerate(couples, 1):
        typer.echo(f"  {i}. {c['id']}")
    choice = typer.prompt("Select couple number", type=int)
    return couples[choice - 1]  # type: ignore[no-any-return]


@couple_app.command("create")
def create() -> None:
    """Link two profiles as a couple."""
    try:
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

        a = typer.prompt("Select partner A (number)", type=int)
        b = typer.prompt("Select partner B (number)", type=int)

        if not typer.confirm("Create this couple?", default=True):
            raise typer.Abort()

        client.create_couple(
            {
                "id": str(uuid.uuid4()),
                "partner_a": profiles[a - 1]["id"],
                "partner_b": profiles[b - 1]["id"],
            }
        )
        console.print(
            f"\n[green]Couple created![/green] "
            f"{profiles[a - 1]['name']} & {profiles[b - 1]['name']}"
        )
    except (ApiError, ConnectionError, TimeoutError) as e:
        typer.echo(str(e), err=True)
        raise typer.Exit(1)


@couple_app.command("show")
def show() -> None:
    """Display the current couple and both profiles."""
    try:
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
    except (ApiError, ConnectionError, TimeoutError) as e:
        typer.echo(str(e), err=True)
        raise typer.Exit(1)


@couple_app.command("unlink")
def unlink() -> None:
    """Remove the couple link (profiles are preserved)."""
    try:
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
    except (ApiError, ConnectionError, TimeoutError) as e:
        typer.echo(str(e), err=True)
        raise typer.Exit(1)
