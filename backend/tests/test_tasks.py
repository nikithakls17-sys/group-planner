from app.tasks import assign, load, tasks_for


def test_heaviest_task_goes_to_lightest_person():
    history = [{"member_key": "asha", "weight": 9}, {"member_key": "ben", "weight": 1}]
    owners = assign([("Book", 3), ("Snacks", 1)], ["asha", "ben", "cy"], history)
    assert owners == ["cy", "ben"]


def test_fairness_sim_10_plans_evens_out():
    people = ["a", "b", "c", "d", "e"]
    history = []
    for i in range(10):
        starter = people[0]  # worst case: the same person starts every plan
        history.append({"member_key": starter, "weight": 3})
        todo = tasks_for(["place", "home", "online", "event"][i % 4])
        for (title, w), who in zip(todo, assign(todo, people, history)):
            history.append({"member_key": who, "weight": w})
    loads = [load(history, p) for p in people]
    # 'a' starts every plan (10 x 3 = 30), so the app gives 'a' no other tasks, and the other four come out even
    task_count_a = sum(1 for h in history if h["member_key"] == "a") - 10  # minus the 10 "started it" rows
    assert task_count_a == 0, loads
    assert max(loads[1:]) - min(loads[1:]) <= 3, loads
